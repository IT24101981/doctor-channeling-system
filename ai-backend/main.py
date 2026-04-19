import joblib
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
import os
import mysql.connector
from dotenv import load_dotenv
from prompts import REPORT_EXPLAIN_PROMPT
import easyocr
from typing import List
import fitz  # PyMuPDF for PDF handling
import io
from PIL import Image
import json
import xgboost as xgb


# easyocr downloads detection/recognition models on first run and prints a progress bar.
# On some Windows terminals this can crash with UnicodeEncodeError, so keep it quiet.
reader = easyocr.Reader(['en'], verbose=False)

load_dotenv()

app = FastAPI(title="NCC eCare AI Backend", version="1.0.0")

# CORS - Allow React frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

# Request Models
class SymptomsRequest(BaseModel):
    symptoms: str

class ReportTextRequest(BaseModel):
    text: str
    language: str = "English"
    model: str = "Gemini 3.1 Flash Lite"

# LLM Query Function - Gemini for Report Explanation
def query_llm_for_report(report_text, language="English", model_name="Gemini 3.1 Flash Lite"):
    """Send medical report text to Gemini LLM for simple explanation"""
    prompt = REPORT_EXPLAIN_PROMPT.format(report_text=report_text, language=language)
    
    # Model mapping (Optimized for current API availability and quota)
    model_map = {
        "Gemini 3.1 Flash Lite": "models/gemini-2.5-flash",
        "Gemma 4 26B": "models/gemma-4-26b-a4b-it",
        "Gemma 3 27B": "models/gemma-3-27b-it"
    }
    
    selected_model = model_map.get(model_name, "models/gemini-2.5-flash")
    
    try:
        response = client.models.generate_content(
            model=selected_model,
            contents=prompt
        )
        return response.text
    except Exception as e:
        print(f"Error in Gemini request ({selected_model}): {e}")
        raise e

# ENDPOINT 1: Medical Report Explainer (LLM)
@app.post("/api/explain")
async def explain_report(req: ReportTextRequest):
    try:
        explanation = query_llm_for_report(req.text, req.language, req.model)
        return {"success": True, "explanation": explanation}
    except Exception as e:
        print(f"ERROR in explain: {e}")
        return {"success": False, "error": str(e)}

# ENDPOINT 2: OCR
@app.post("/api/ocr")
async def ocr_extract(files: List[UploadFile] = File(...)):
    all_extracted_text = []

    for file in files:
        contents = await file.read()
        
        if file.filename.lower().endswith('.pdf'):
            # Handle PDF
            try:
                doc = fitz.open(stream=contents, filetype="pdf")
                for page_num in range(len(doc)):
                    page = doc.load_page(page_num)
                    pix = page.get_pixmap()
                    img_data = pix.tobytes("png")
                    results = reader.readtext(img_data, detail=0)
                    all_extracted_text.append(" ".join(results))
                doc.close()
            except Exception as e:
                print(f"PDF Error: {e}")
                continue
        else:
            # Handle Image
            results = reader.readtext(contents, detail=0)
            all_extracted_text.append(" ".join(results))
    
    combined_text = "\n\n".join(all_extracted_text)
    
    return {"success": True, "text": combined_text}

# ENDPOINT 3: Doctor Suggestion (from Database by specialization)
def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        ssl_disabled=False
    )

@app.get("/api/suggest-doctor")
async def suggest_doctor(specialization: str = "General"):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, name, specialization, hospital, email, phone FROM doctors WHERE LOWER(specialization) LIKE LOWER(%s) AND status = 'approved'",
            (f"%{specialization}%",)
        )
        doctors = cursor.fetchall()
        cursor.close()
        conn.close()
        return {"success": True, "doctors": doctors, "specialization": specialization}
    except Exception as e:
        return {"success": False, "error": str(e), "doctors": []}

# Health Check Endpoint
@app.get("/")
async def health_check():
    return {
        "status": "running",
        "service": "NCC eCare AI Backend",
        "version": "1.0.0",
        "endpoints": [
            "POST /api/explain",
            "POST /api/ocr",
            "GET /api/suggest-doctor"
        ]
    }

model = joblib.load("model/xgb_tuned.pkl")

# Load model feature names to ensure correct order and preprocessing
try:
    with open("model_features.json", "r") as f:
        MODEL_FEATURES = json.load(f)
except Exception as e:
    print(f"Warning: Could not load model_features.json: {e}")
    MODEL_FEATURES = []

def calculate_engineered_features(symptoms_dict):
    """Calculate system-specific counts and indicators for the XGBoost model"""
    # Define keywords for different body systems
    systems = {
        "respiratory": ['breathing', 'cough', 'lung', 'shortness', 'wheezing', 'congestion', 'sore throat', 'sneezing', 'apnea', 'nose', 'coryza', 'sputum', 'pneumonia'],
        "digestive": ['abdominal', 'stomach', 'constipation', 'diarrhea', 'nausea', 'vomiting', 'heartburn', 'flatulence', 'stool', 'mouth', 'tongue', 'gastric', 'rectal', 'bowel'],
        "pain": ['pain', 'ache', 'cramps', 'stiffness', 'soreness', 'hurts', 'burning', 'sharp'],
        "neurological": ['weakness', 'numbness', 'memory', 'dizziness', 'fainting', 'seizures', 'slurring', 'movement', 'balance', 'paresthesia', 'loss of sensation', 'disturbance'],
        "mental_health": ['anxiety', 'depression', 'hallucinations', 'delusions', 'anger', 'mood', 'behavior', 'phobias', 'memories', 'obsessions', 'hostile', 'stress'],
        "skin": ['skin', 'rash', 'itching', 'lesion', 'moles', 'eyelid', 'scalp', 'nails', 'peeling', 'dryness', 'pigmentation', 'scab', 'wart']
    }

    results = {}
    total_count = sum(1 for k, v in symptoms_dict.items() if v == 1 and k != 'symptom_count')
    results["symptom_count"] = total_count
    
    # We don't have the exact weights for rarity and tfidf, so we use defaults
    results["rarity_score"] = 0.0
    results["tfidf_score"] = 0.0

    for sys_name, keywords in systems.items():
        count = sum(1 for k, v in symptoms_dict.items() if v == 1 and any(kw in k.lower() for kw in keywords))
        results[f"sys_{sys_name}"] = 1 if count > 0 else 0
        results[f"sys_{sys_name}_count"] = count

    return results

# රෝග ලැයිස්තුව (Mapping Dictionary)
disease_map = {
    0: "actinic keratosis",
    1: "acute bronchiolitis",
    2: "acute bronchitis",
    3: "acute bronchospasm",
    4: "acute kidney injury",
    5: "acute otitis media",
    6: "acute pancreatitis",
    7: "acute sinusitis",
    8: "acute stress reaction",
    9: "alcohol withdrawal",
    10: "allergy",
    11: "angina",
    12: "anxiety",
    13: "appendicitis",
    14: "arthritis of the hip",
    15: "asthma",
    16: "bell palsy",
    17: "benign prostatic hyperplasia (bph)",
    18: "benign vaginal discharge (leukorrhea)",
    19: "bipolar disorder",
    20: "blepharitis",
    21: "brachial neuritis",
    22: "bursitis",
    23: "carpal tunnel syndrome",
    24: "chalazion",
    25: "cholecystitis",
    26: "chronic back pain",
    27: "chronic constipation",
    28: "chronic glaucoma",
    29: "chronic obstructive pulmonary disease (copd)",
    30: "chronic otitis media",
    31: "chronic pain disorder",
    32: "chronic sinusitis",
    33: "common cold",
    34: "complex regional pain syndrome",
    35: "concussion",
    36: "conduct disorder",
    37: "conjunctivitis",
    38: "conjunctivitis due to allergy",
    39: "conjunctivitis due to virus",
    40: "contact dermatitis",
    41: "cornea infection",
    42: "corneal disorder",
    43: "croup",
    44: "cystitis",
    45: "degenerative disc disease",
    46: "dental caries",
    47: "depression",
    48: "developmental disability",
    49: "diabetic ketoacidosis",
    50: "diaper rash",
    51: "diverticulitis",
    52: "diverticulosis",
    53: "drug reaction",
    54: "dry eye of unknown cause",
    55: "ear drum damage",
    56: "ear wax impaction",
    57: "eczema",
    58: "esophagitis",
    59: "eustachian tube dysfunction (ear disorder)",
    60: "fibromyalgia",
    61: "flu",
    62: "fracture of the leg",
    63: "fracture of the rib",
    64: "fungal infection of the hair",
    65: "fungal infection of the skin",
    66: "gallstone",
    67: "ganglion cyst",
    68: "gastritis",
    69: "gastroduodenal ulcer",
    70: "gastrointestinal hemorrhage",
    71: "gout",
    72: "gum disease",
    73: "heart attack",
    74: "heart failure",
    75: "hemangioma",
    76: "hemorrhoids",
    77: "herniated disk",
    78: "hiatal hernia",
    79: "hyperemesis gravidarum",
    80: "hyperkalemia",
    81: "hypertensive heart disease",
    82: "hypoglycemia",
    83: "idiopathic excessive menstruation",
    84: "idiopathic irregular menstrual cycle",
    85: "idiopathic painful menstruation",
    86: "impetigo",
    87: "infectious gastroenteritis",
    88: "injury to the arm",
    89: "injury to the leg",
    90: "injury to the trunk",
    91: "insect bite",
    92: "iron deficiency anemia",
    93: "ischemic heart disease",
    94: "kidney stone",
    95: "labyrinthitis",
    96: "laryngitis",
    97: "lipoma",
    98: "liver disease",
    99: "macular degeneration",
    100: "marijuana abuse",
    101: "mononeuritis",
    102: "multiple sclerosis",
    103: "muscle spasm",
    104: "neuralgia",
    105: "neurosis",
    106: "noninfectious gastroenteritis",
    107: "nose disorder",
    108: "obstructive sleep apnea (osa)",
    109: "oral thrush (yeast infection)",
    110: "osteoarthritis",
    111: "otitis externa (swimmer's ear)",
    112: "otitis media",
    113: "pain after an operation",
    114: "panic disorder",
    115: "paroxysmal ventricular tachycardia",
    116: "pelvic inflammatory disease",
    117: "peripheral nerve disorder",
    118: "personality disorder",
    119: "pneumonia",
    120: "problem during pregnancy",
    121: "prostatitis",
    122: "psoriasis",
    123: "psychotic disorder",
    124: "pulmonary embolism",
    125: "pyelonephritis",
    126: "pyogenic skin infection",
    127: "rectal disorder",
    128: "rheumatoid arthritis",
    129: "rosacea",
    130: "schizophrenia",
    131: "sciatica",
    132: "seasonal allergies (hay fever)",
    133: "sebaceous cyst",
    134: "seborrheic dermatitis",
    135: "seborrheic keratosis",
    136: "sensorineural hearing loss",
    137: "sepsis",
    138: "sickle cell crisis",
    139: "sinus bradycardia",
    140: "skin cancer",
    141: "skin disorder",
    142: "skin pigmentation disorder",
    143: "skin polyp",
    144: "smoking or tobacco addiction",
    145: "spinal stenosis",
    146: "spondylolisthesis",
    147: "spondylosis",
    148: "spontaneous abortion",
    149: "sprain or strain",
    150: "strep throat",
    151: "stye",
    152: "temporary or benign blood in urine",
    153: "tendinitis",
    154: "threatened pregnancy",
    155: "tooth abscess",
    156: "tooth disorder",
    157: "transient ischemic attack",
    158: "urinary tract infection",
    159: "urinary tract obstruction",
    160: "vaginal cyst",
    161: "vaginitis",
    162: "varicocele of the testicles",
    163: "vulvodynia"
}

def get_specialist_mapping(disease_name):
    
    if not disease_name:
        return "General Physician"

    disease = disease_name.lower().strip()

    # 1. චර්ම රෝග විශේෂඥ (Dermatologist)
    dermatology = [
        "actinic keratosis", "allergic contact dermatitis", "blepharitis", "chalazion", "contact dermatitis",
        "cornea infection", "corneal disorder", "diaper rash", "eczema", "fungal infection of the hair",
        "fungal infection of the skin", "hemangioma", "impetigo", "insect bite", "lipoma", "oral thrush (yeast infection)",
        "psoriasis", "pyogenic skin infection", "rosacea", "sebaceous cyst", "seborrheic dermatitis",
        "seborrheic keratosis", "skin cancer", "skin disorder", "skin pigmentation disorder", "skin polyp", "stye"
    ]

    # 2. හෘද රෝග විශේෂඥ (Cardiologist)
    cardiology = [
        "angina", "heart attack", "heart failure", "hypertensive heart disease", "ischemic heart disease",
        "paroxysmal ventricular tachycardia", "sinus bradycardia"
    ]

    # 3. ස්නායු රෝග විශේෂඥ (Neurologist)
    neurology = [
        "bell palsy", "brachial neuritis", "carpal tunnel syndrome", "concussion", "mononeuritis",
        "multiple sclerosis", "neuralgia", "peripheral nerve disorder", "sciatica", "transient ischemic attack"
    ]

    # 4. ශ්වසන රෝග විශේෂඥ (Pulmonologist / ENT)
    respiratory_ent = [
        "acute bronchiolitis", "acute bronchitis", "acute bronchospasm", "acute otitis media", "acute sinusitis",
        "asthma", "chronic obstructive pulmonary disease (copd)", "chronic otitis media", "chronic sinusitis",
        "common cold", "croup", "ear drum damage", "ear wax impaction", "eustachian tube dysfunction (ear disorder)",
        "flu", "labyrinthitis", "laryngitis", "nose disorder", "otitis externa (swimmer's ear)", "otitis media",
        "pneumonia", "pulmonary embolism", "seasonal allergies (hay fever)", "sinusitis", "strep throat"
    ]

    # 5. ආමාශ සහ බඩවැල් පිළිබඳ විශේෂඥ (Gastroenterologist)
    gastroenterology = [
        "appendicitis", "cholecystitis", "chronic constipation", "diverticulitis", "diverticulosis", "esophagitis",
        "gastritis", "gastroduodenal ulcer", "gastrointestinal hemorrhage", "hemorrhoids", "hiatal hernia",
        "infectious gastroenteritis", "liver disease", "noninfectious gastroenteritis", "rectal disorder"
    ]

    # 6. අස්ථි සහ සන්ධි විශේෂඥ (Orthopedician)
    orthopedics = [
        "arthritis of the hip", "bursitis", "chronic back pain", "degenerative disc disease", "fibromyalgia",
        "fracture of the leg", "fracture of the rib", "ganglion cyst", "herniated disk", "injury to the arm",
        "injury to the leg", "injury to the trunk", "muscle spasm", "osteoarthritis", "rheumatoid arthritis",
        "spinal stenosis", "spondylolisthesis", "spondylosis", "sprain or strain", "tendinitis"
    ]

    # 7. මනෝ වෛද්‍ය (Psychiatrist / Psychologist)
    psychiatry = [
        "acute stress reaction", "anxiety", "bipolar disorder", "chronic pain disorder", "conduct disorder",
        "depression", "marijuana abuse", "neurosis", "panic disorder", "personality disorder", "psychotic disorder",
        "schizophrenia", "smoking or tobacco addiction"
    ]

    # 8. වකුගඩු සහ මුත්‍රාවාහිනී විශේෂඥ (Urologist / Nephrologist)
    urology = [
        "acute kidney injury", "benign prostatic hyperplasia (bph)", "cystitis", "kidney stone", "prostatitis",
        "pyelonephritis", "temporary or benign blood in urine", "urinary tract infection", "urinary tract obstruction",
        "varicocele of the testicles"
    ]

    # 9. ස්ත්‍රී රෝග විශේෂඥ (Gynecologist)
    gynecology = [
        "benign vaginal discharge (leukorrhea)", "hyperemesis gravidarum", "idiopathic excessive menstruation",
        "idiopathic irregular menstrual cycle", "idiopathic painful menstruation", "pelvic inflammatory disease",
        "problem during pregnancy", "spontaneous abortion", "threatened pregnancy", "vaginal cyst", "vaginitis",
        "vulvodynia"
    ]

    # 10. අක්ෂි රෝග විශේෂඥ (Ophthalmologist)
    ophthalmology = [
        "chronic glaucoma", "conjunctivitis", "conjunctivitis due to allergy", "conjunctivitis due to virus",
        "dry eye of unknown cause", "macular degeneration"
    ]

    # 11. දන්ත වෛද්‍ය (Dentist)
    dentistry = [
        "dental caries", "gum disease", "tooth abscess", "tooth disorder"
    ]

    # 12. හෝර්මෝන සහ දියවැඩියා විශේෂඥ (Endocrinologist)
    endocrinology = [
        "diabetic ketoacidosis", "hypoglycemia"
    ]

    # 13. හදිසි ප්‍රතිකාර (Emergency Physician)
    emergency = [
        "sepsis", "sickle cell crisis", "pain after an operation"
    ]

    # කාණ්ඩ පරීක්ෂා කර විශේෂඥයා ලබා දීම
    if disease in dermatology: return "Dermatologist"
    if disease in cardiology: return "Cardiologist"
    if disease in neurology: return "Neurologist"
    if disease in respiratory_ent: return "ENT Specialist / Pulmonologist"
    if disease in gastroenterology: return "Gastroenterologist"
    if disease in orthopedics: return "Orthopedic Surgeon"
    if disease in psychiatry: return "Psychiatrist"
    if disease in urology: return "Urologist"
    if disease in gynecology: return "Gynecologist"
    if disease in ophthalmology: return "Ophthalmologist"
    if disease in dentistry: return "Dentist"
    if disease in endocrinology: return "Endocrinologist"
    if disease in emergency: return "Emergency Care Physician"

    # කිසිවක් නොගැලපේ නම් සාමාන්‍ය වෛද්‍යවරයා වෙත යොමු කිරීම
    return "General Physician"

@app.post("/api/predict")
def predict(data: dict):
    try:
        # 1. Calculate engineered features from incoming data
        engineered = calculate_engineered_features(data)
        
        # 2. Construct feature vector in the EXACT order the model expects (268 features)
        feature_vector = []
        for feature_name in MODEL_FEATURES:
            if feature_name in data:
                feature_vector.append(float(data[feature_name]))
            elif feature_name in engineered:
                feature_vector.append(float(engineered[feature_name]))
            else:
                # Default to 0 if feature is missing
                feature_vector.append(0.0)
        
        # 3. Perform prediction
        features = [feature_vector]
        prediction_label = int(model.predict(features)[0])
        
        # Calculate confidence score
        probabilities = model.predict_proba(features)[0]
        confidence = float(max(probabilities))
        
        # Get disease name from map
        disease_name = disease_map.get(prediction_label)
        if not disease_name:
            disease_name = f"Unknown Condition (Label {prediction_label})"
            specialist = "General Physician"
        else:
            # Get specialist mapping
            specialist = get_specialist_mapping(disease_name)
        
        return {
            "success": True,
            "prediction": disease_name,
            "suggested_specialist": specialist,
            "confidence": confidence
        }
    except Exception as e:
        print(f"Prediction Error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}