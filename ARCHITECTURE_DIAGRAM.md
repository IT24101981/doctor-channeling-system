# AI Features - Logic Architecture

This diagram focuses only on the AI feature logic. It does not describe folder structure, UI styling, or the full appointment/payment system.

## AI Feature Boundary

```mermaid
flowchart LR
    Patient["Patient"]

    subgraph ReactSPA["React eCare UI"]
        ReportUI["AI Report Explainer"]
        SmartDocUI["Smart Doctor Suggestion"]
        SymptomsJson["Symptoms catalog\nsymptoms.json"]
    end

    subgraph FastAPI["FastAPI AI Service"]
        OCRAPI["POST /api/ocr"]
        ExplainAPI["POST /api/explain"]
        PredictAPI["POST /api/predict"]
        SuggestDoctorAPI["GET /api/suggest-doctor"]
    end

    subgraph ReportLogic["Report Explanation Logic"]
        FileParser["File type handling\nimage or PDF"]
        PDFRender["PDF page rendering\nPyMuPDF"]
        OCR["Text extraction\nEasyOCR"]
        PromptBuilder["Medical explanation prompt\nlanguage + OCR text"]
        LLM["Gemini content generation"]
    end

    subgraph PredictionLogic["Doctor Suggestion Logic"]
        FeatureVector["Symptom feature vector"]
        FeatureEngineering["Engineered features\nsymptom count + body systems"]
        XGBModel["XGBoost disease model"]
        DiseaseMap["Prediction label to disease"]
        SpecialistMap["Disease to specialist mapping"]
        ApprovedDoctorQuery["Approved doctor lookup"]
    end

    subgraph DataExternal["Data and External Dependencies"]
        ModelFiles["Model artifacts\nxgb_tuned.pkl + model_features.json"]
        MySQL[("MySQL doctors table")]
        Gemini["Google Gemini API"]
    end

    Patient --> ReportUI
    Patient --> SmartDocUI

    ReportUI -->|"Upload image/PDF files"| OCRAPI
    OCRAPI --> FileParser
    FileParser -->|"PDF"| PDFRender
    PDFRender --> OCR
    FileParser -->|"Image"| OCR
    OCR -->|"Extracted text"| ReportUI

    ReportUI -->|"Reviewed text + language + model"| ExplainAPI
    ExplainAPI --> PromptBuilder
    PromptBuilder --> LLM
    LLM --> Gemini
    Gemini -->|"Patient-friendly explanation"| ExplainAPI
    ExplainAPI --> ReportUI

    SmartDocUI --> SymptomsJson
    SymptomsJson --> FeatureVector
    SmartDocUI -->|"Selected symptoms as 0/1 features"| PredictAPI
    PredictAPI --> FeatureEngineering
    FeatureEngineering --> FeatureVector
    FeatureVector --> XGBModel
    ModelFiles --> XGBModel
    XGBModel --> DiseaseMap
    DiseaseMap --> SpecialistMap
    SpecialistMap -->|"Disease, specialist, confidence"| SmartDocUI

    SmartDocUI -->|"Specialist name"| SuggestDoctorAPI
    SuggestDoctorAPI --> ApprovedDoctorQuery
    ApprovedDoctorQuery --> MySQL
    MySQL -->|"Approved matching doctors"| SuggestDoctorAPI
    SuggestDoctorAPI --> SmartDocUI
```

## Report Explainer Flow

```mermaid
sequenceDiagram
    actor Patient
    participant UI as React Report Explainer
    participant OCR as FastAPI /api/ocr
    participant Explain as FastAPI /api/explain
    participant EasyOCR as EasyOCR
    participant PyMuPDF as PyMuPDF
    participant Gemini as Gemini API

    Patient->>UI: Upload report image or PDF
    UI->>OCR: Send multipart files

    alt PDF report
        OCR->>PyMuPDF: Render each PDF page as image
        PyMuPDF-->>OCR: Page images
        OCR->>EasyOCR: Extract text from each page image
    else Image report
        OCR->>EasyOCR: Extract text from image bytes
    end

    EasyOCR-->>OCR: Extracted report text
    OCR-->>UI: Combined OCR text
    Patient->>UI: Review text, choose language/model
    UI->>Explain: Send text, language, selected model
    Explain->>Gemini: Send medical explanation prompt
    Gemini-->>Explain: Simple patient-friendly explanation
    Explain-->>UI: Explanation result
    UI-->>Patient: Display explanation with disclaimer
```

## Smart Doctor Suggestion Flow

```mermaid
sequenceDiagram
    actor Patient
    participant UI as React Smart Doctor Suggestion
    participant Predict as FastAPI /api/predict
    participant Model as XGBoost Model
    participant Suggest as FastAPI /api/suggest-doctor
    participant DB as MySQL

    Patient->>UI: Select symptoms
    UI->>UI: Convert selected symptoms to 0/1 feature payload
    UI->>Predict: Submit symptom feature payload
    Predict->>Predict: Calculate symptom_count and body-system features
    Predict->>Model: Predict disease label and probabilities
    Model-->>Predict: Disease label + confidence scores
    Predict->>Predict: Map label to disease name
    Predict->>Predict: Map disease to specialist
    Predict-->>UI: Disease, specialist, confidence
    UI->>Suggest: Request doctors by specialist
    Suggest->>DB: Query approved doctors by specialization
    DB-->>Suggest: Matching approved doctors
    Suggest-->>UI: Doctor list
    UI-->>Patient: Show suspected condition and doctor path
```

## Endpoint Logic Map

```mermaid
flowchart TD
    OCR["POST /api/ocr"]
    Explain["POST /api/explain"]
    Predict["POST /api/predict"]
    Suggest["GET /api/suggest-doctor"]

    OCR --> OCRInput["Input: one or more files"]
    OCRInput --> OCRBranch{"File type?"}
    OCRBranch -->|"PDF"| PDFLogic["Render pages with PyMuPDF"]
    OCRBranch -->|"Image"| ImageLogic["Read image bytes"]
    PDFLogic --> OCRExtract["Run EasyOCR"]
    ImageLogic --> OCRExtract
    OCRExtract --> OCRResponse["Output: combined extracted text"]

    Explain --> ExplainInput["Input: text, language, model"]
    ExplainInput --> Prompt["Format REPORT_EXPLAIN_PROMPT"]
    Prompt --> ModelSelect["Map UI model name to Gemini model id"]
    ModelSelect --> GeminiCall["Generate response with Gemini"]
    GeminiCall --> ExplainResponse["Output: explanation"]

    Predict --> PredictInput["Input: symptom feature dictionary"]
    PredictInput --> Engineered["Build engineered features"]
    Engineered --> OrderedVector["Create ordered feature vector from model_features.json"]
    OrderedVector --> Prediction["Run XGBoost predict + predict_proba"]
    Prediction --> Disease["Map label to disease"]
    Disease --> Specialist["Map disease to specialist"]
    Specialist --> PredictResponse["Output: prediction, specialist, confidence"]

    Suggest --> SuggestInput["Input: specialization query"]
    SuggestInput --> DoctorSQL["Search approved doctors by specialization"]
    DoctorSQL --> SuggestResponse["Output: doctors list"]
```

## Core Logic Rules

- The React UI is responsible for collecting user input, building request payloads, and displaying AI results.
- The FastAPI service owns all AI logic: OCR, prompt construction, model inference, disease mapping, specialist mapping, and doctor lookup.
- OCR is a two-step pipeline for PDFs: render pages first, then run OCR on page images.
- Report explanation uses OCR text plus the selected language to produce a patient-friendly response through Gemini.
- Disease prediction uses the selected symptoms, engineered symptom/body-system features, and the saved XGBoost model artifacts.
- Doctor suggestions are not generated by the model directly. The model predicts a disease, the backend maps it to a specialist, then the backend queries approved doctors from MySQL.
- The AI output is advisory only and should remain paired with a medical disclaimer in the UI.
