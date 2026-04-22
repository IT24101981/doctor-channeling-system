import json
import os

import easyocr
import fitz  # PyMuPDF for PDF handling
import joblib  # for load the model
import mysql.connector
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from prompts import REPORT_EXPLAIN_PROMPT
from pydantic import BaseModel
from typing import List, Literal


load_dotenv()

reader = easyocr.Reader(["en"], verbose=False)


# AI backend deployment (localhost)
app = FastAPI(title="NCC eCare AI Backend", version="1.0.0")

# CORS - Allow React frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Integrate Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)



# Request model
class ReportTextRequest(BaseModel):
    text: str
    language: Literal["Sinhala", "Tamil", "English"]
    model: str = "Gemini 2.5 Flash"

    

# Gemini for report explanation
def query_llm_for_report(report_text, language, model_name: str = "Gemini 3.1 Flash Lite"):
    """Send medical report text to Gemini LLM for a simple explanation."""
    prompt = REPORT_EXPLAIN_PROMPT.format(report_text=report_text, language=language)
    
    # Model mapping
    model_map = {
        "Gemini 2.5 Flash": "models/gemini-2.5-flash",
        "Gemma 4 26B": "models/gemma-4-26b-a4b-it",
        "Gemma 3 27B": "models/gemma-3-27b-it",
        "Gemini 3.1 Flash Lite": "models/gemini-3.1-flash-lite-preview"
    }
    
    selected_model = model_map.get(model_name, "models/gemma-4-26b-a4b-it")
    
    try:
        response = client.models.generate_content(
            model=selected_model,
            contents=prompt
        )
        return response.text
    except Exception as e:
        print(f"Error in Gemini request ({selected_model}): {e}")
        raise




# Endpoint 1: medical report explainer (Google models)
@app.post("/api/explain")
async def explain_report(req: ReportTextRequest):
    try:
        explanation = query_llm_for_report(req.text, req.language, req.model)
        return {"success": True, "explanation": explanation}
    except Exception as e:
        print(f"ERROR in explain: {e}")
        return {"success": False, "error": str(e)}




# endpoint2: OCR
@app.post("/api/ocr")
async def ocr_extract(files: List[UploadFile] = File(...)):
    all_extracted_text = []

    for file in files:
        contents = await file.read()
        
        if file.filename.lower().endswith(".pdf"):
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




# Doctor suggestion (DB)

def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        ssl_disabled=False
    )




# suggest doctor according to predicted specialization
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




# ML model + feature engineering


model = joblib.load("model/xgb_tuned.pkl") #load the model




# load model features from json file
try:
    with open("model_features.json", "r") as f:
        MODEL_FEATURES = json.load(f)
except Exception as e:
    print(f"Warning: Could not load model_features.json: {e}")
    MODEL_FEATURES = []




# feature engineering support from pipeline feature engineering
ENGINEERED_COLS = [
    "symptom_count",
    "sys_respiratory",
    "sys_digestive",
    "sys_pain",
    "sys_neurological",
    "sys_mental_health",
    "sys_skin",
    "sys_respiratory_count",
    "sys_digestive_count",
    "sys_pain_count",
    "sys_neurological_count",
    "sys_mental_health_count",
    "sys_skin_count",
]

# body system groupings from pipeline feature engineering
BODY_SYSTEMS = {

    'respiratory': [
        'cough', 'shortness of breath', 'breathing fast', 'difficulty breathing',
        'nasal congestion', 'coryza', 'sneezing', 'sinus congestion', 'wheezing',
        'congestion in chest', 'hemoptysis', 'coughing up sputum', 'apnea',
        'hoarse voice', 'hurts to breath'
    ],
    'digestive': [
        'nausea', 'vomiting', 'diarrhea', 'constipation', 'stomach bloating',
        'heartburn', 'sharp abdominal pain', 'burning abdominal pain',
        'lower abdominal pain', 'upper abdominal pain', 'blood in stool',
        'changes in stool appearance', 'regurgitation', 'melena',
        'difficulty in swallowing', 'regurgitation.1'
    ],
    'pain': [
        'back pain', 'low back pain', 'joint pain', 'muscle pain', 'headache',
        'chest tightness', 'sharp chest pain', 'burning chest pain', 'leg pain',
        'arm pain', 'neck pain', 'knee pain', 'shoulder pain', 'hip pain',
        'ankle pain', 'foot or toe pain', 'wrist pain', 'elbow pain',
        'hand or finger pain'
    ],
    'neurological': [
        'dizziness', 'fainting', 'seizures', 'loss of sensation', 'paresthesia',
        'focal weakness', 'disturbance of memory', 'difficulty speaking',
        'double vision', 'abnormal involuntary movements', 'problems with movement'
    ],
    'mental_health': [
        'anxiety and nervousness', 'depression', 'insomnia',
        'depressive or psychotic symptoms', 'delusions or hallucinations',
        'obsessions and compulsions', 'fears and phobias', 'low self-esteem',
        'excessive anger', 'hostile behavior', 'temper problems',
        'hysterical behavior', 'restlessness', 'antisocial behavior'
    ],
    'skin': [
        'skin rash', 'itching of skin', 'skin swelling', 'abnormal appearing skin',
        'skin lesion', 'skin dryness', 'skin growth', 'skin moles',
        'skin irritation', 'peeling', 'warts', 'acne or pimples', 'jaundice', 'scaliness'
    ]
}

# convert input data to float. (0.0 or 1.0)
def _as_float01(value):

    try:
        numeric = float(value)
        if numeric == 1.0:
            return 1.0
        else:
            return 0.0

    except Exception:
        return 0.0


# calculate engineered features (used for feature engineering)
def calculate_engineered_features(symptoms_dict):
    """
    Feature engineering (notebook-aligned):
    - symptom_count = total selected symptoms
    - sys_* flags + sys_*_count = body system coverage
    """
    # identify raw symptom features
    symptom_features = []
    for f in MODEL_FEATURES:
        if f in ENGINEERED_COLS:
            continue
        if f in symptoms_dict:
            symptom_features.append(f)

    # calculate symptom count
    symptom_count = 0.0
    for f in symptom_features:
        symptom_value = symptoms_dict.get(f, 0.0)
        symptom_count += _as_float01(symptom_value)

    # create engineered features dictionary
    engineered = {
        "symptom_count": float(symptom_count),
    }

    # check the engineering features
    for sys_name, symptoms in BODY_SYSTEMS.items():
        count = 0
        for s in symptoms:
            selected = _as_float01(symptoms_dict.get(s, 0.0))
            if selected == 1.0:
                count += 1
            else:
                count += 0

        if count > 0:
            engineered[f"sys_{sys_name}"] = 1.0
        else:
            engineered[f"sys_{sys_name}"] = 0.0
        engineered[f"sys_{sys_name}_count"] = float(count)

    return engineered


# Disease mapping + specialist mapping


# disease map
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

    # dermatologist mapping
    dermatology = [
        "actinic keratosis", "allergic contact dermatitis", "blepharitis", "chalazion", "contact dermatitis",
        "cornea infection", "corneal disorder", "diaper rash", "eczema", "fungal infection of the hair",
        "fungal infection of the skin", "hemangioma", "impetigo", "insect bite", "lipoma", "oral thrush (yeast infection)",
        "psoriasis", "pyogenic skin infection", "rosacea", "sebaceous cyst", "seborrheic dermatitis",
        "seborrheic keratosis", "skin cancer", "skin disorder", "skin pigmentation disorder", "skin polyp", "stye"
    ]

    # cardiologist mapping
    cardiology = [
        "angina", "heart attack", "heart failure", "hypertensive heart disease", "ischemic heart disease",
        "paroxysmal ventricular tachycardia", "sinus bradycardia"
    ]

    # neurologist mapping
    neurology = [
        "bell palsy", "brachial neuritis", "carpal tunnel syndrome", "concussion", "mononeuritis",
        "multiple sclerosis", "neuralgia", "peripheral nerve disorder", "sciatica", "transient ischemic attack"
    ]

    # pulmonologist / ENT mapping
    respiratory_ent = [
        "acute bronchiolitis", "acute bronchitis", "acute bronchospasm", "acute otitis media", "acute sinusitis",
        "asthma", "chronic obstructive pulmonary disease (copd)", "chronic otitis media", "chronic sinusitis",
        "common cold", "croup", "ear drum damage", "ear wax impaction", "eustachian tube dysfunction (ear disorder)",
        "flu", "labyrinthitis", "laryngitis", "nose disorder", "otitis externa (swimmer's ear)", "otitis media",
        "pneumonia", "pulmonary embolism", "seasonal allergies (hay fever)", "sinusitis", "strep throat"
    ]

    # gastroenterologist mapping
    gastroenterology = [
        "appendicitis", "cholecystitis", "chronic constipation", "diverticulitis", "diverticulosis", "esophagitis",
        "gastritis", "gastroduodenal ulcer", "gastrointestinal hemorrhage", "hemorrhoids", "hiatal hernia",
        "infectious gastroenteritis", "liver disease", "noninfectious gastroenteritis", "rectal disorder"
    ]

    # orthopedician mapping
    orthopedics = [
        "arthritis of the hip", "bursitis", "chronic back pain", "degenerative disc disease", "fibromyalgia",
        "fracture of the leg", "fracture of the rib", "ganglion cyst", "herniated disk", "injury to the arm",
        "injury to the leg", "injury to the trunk", "muscle spasm", "osteoarthritis", "rheumatoid arthritis",
        "spinal stenosis", "spondylolisthesis", "spondylosis", "sprain or strain", "tendinitis"
    ]

    # psychiatrist / psychologist mapping
    psychiatry = [
        "acute stress reaction", "anxiety", "bipolar disorder", "chronic pain disorder", "conduct disorder",
        "depression", "marijuana abuse", "neurosis", "panic disorder", "personality disorder", "psychotic disorder",
        "schizophrenia", "smoking or tobacco addiction"
    ]

    # urologist / nephrologist mapping
    urology = [
        "acute kidney injury", "benign prostatic hyperplasia (bph)", "cystitis", "kidney stone", "prostatitis",
        "pyelonephritis", "temporary or benign blood in urine", "urinary tract infection", "urinary tract obstruction",
        "varicocele of the testicles"
    ]

    # gynecologist mapping
    gynecology = [
        "benign vaginal discharge (leukorrhea)", "hyperemesis gravidarum", "idiopathic excessive menstruation",
        "idiopathic irregular menstrual cycle", "idiopathic painful menstruation", "pelvic inflammatory disease",
        "problem during pregnancy", "spontaneous abortion", "threatened pregnancy", "vaginal cyst", "vaginitis",
        "vulvodynia"
    ]

    # ophthalmologist mapping
    ophthalmology = [
        "chronic glaucoma", "conjunctivitis", "conjunctivitis due to allergy", "conjunctivitis due to virus",
        "dry eye of unknown cause", "macular degeneration"
    ]

    # dentist mapping
    dentistry = [
        "dental caries", "gum disease", "tooth abscess", "tooth disorder"
    ]

    # endocrinologist mapping
    endocrinology = [
        "diabetic ketoacidosis", "hypoglycemia"
    ]

    # emergency physician mapping
    emergency = [
        "sepsis", "sickle cell crisis", "pain after an operation"
    ]

    # mapping disease to specialist
    if disease in dermatology:
        return "Dermatologist"
    elif disease in cardiology:
        return "Cardiologist"
    elif disease in neurology:
        return "Neurologist"
    elif disease in respiratory_ent:
        return "ENT Specialist / Pulmonologist"
    elif disease in gastroenterology:
        return "Gastroenterologist"
    elif disease in orthopedics:
        return "Orthopedic Surgeon"
    elif disease in psychiatry:
        return "Psychiatrist"
    elif disease in urology:
        return "Urologist"
    elif disease in gynecology:
        return "Gynecologist"
    elif disease in ophthalmology:
        return "Ophthalmologist"
    elif disease in dentistry:
        return "Dentist"
    elif disease in endocrinology:
        return "Endocrinologist"
    elif disease in emergency:
        return "Emergency Care Physician"

    # default to general physician
    return "General Physician"







@app.post("/api/predict")



def predict(data: dict):


    try:
        engineered = calculate_engineered_features(data)

        # Construct feature vector in the EXACT order the model expects
        feature_vector = []
        for feature_name in MODEL_FEATURES:
            if feature_name in data:
                feature_vector.append(float(data[feature_name]))
            elif feature_name in engineered:
                feature_vector.append(float(engineered[feature_name]))
            else:
                # Default to 0 if feature is missing
                feature_vector.append(0.0)
        
        # Perform prediction
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