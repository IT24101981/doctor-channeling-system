# NCC eCare Platform

<!-- Project Logo (replace with your logo) -->
<!-- ![NCC eCare Platform Logo](./docs/assets/logo.png) -->

[![Build](https://img.shields.io/badge/Build-Passing-brightgreen)](./)
[![Version](https://img.shields.io/badge/Version-1.0.0-blue)](./)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=000)](./)
[![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?logo=node.js&logoColor=fff)](./)
[![Express](https://img.shields.io/badge/API-Express-000000?logo=express&logoColor=fff)](./)
[![FastAPI](https://img.shields.io/badge/AI%20API-FastAPI-009688?logo=fastapi&logoColor=fff)](./)
[![MySQL](https://img.shields.io/badge/Database-MySQL-4479A1?logo=mysql&logoColor=fff)](./)
[![Python](https://img.shields.io/badge/AI%2FML-Python-3776AB?logo=python&logoColor=fff)](./)

**NCC eCare Platform** is a client-based **Smart e-Channeling & Health Literacy Platform** built for **Narammala Channel Centre**. It streamlines appointment booking, patient/doctor workflows, and payments—while enhancing patient understanding via AI-powered medical report explanations.

- **Live URL**: `https://nccecare.vercel.app`

---

## Introduction (Problem Statement)

Rural patients often face avoidable barriers when seeking timely medical care—such as long travel distances, repeated visits to confirm doctor availability, and delays in understanding medical reports due to complex clinical terminology.

**NCC eCare Platform** addresses these issues by providing:

- **Real-time e-channeling** (availability, booking, confirmations)
- **Digitized patient & doctor management**
- **Integrated payments** to reduce on-site friction
- **AI-assisted health literacy** so patients can understand medical reports and make informed next steps

---

## Core Features

### Patient Management
- **Patient profiles**: Centralized demographic + contact details
- **Appointment history**: Past and upcoming appointments, status tracking

### Doctor Management
- **Schedule management**: Availability windows, session times, channeling limits
- **Roster updates**: Staff-controlled roster changes and announcements

### Appointment Management
- **Real-time scheduling**: View live availability per doctor/specialty
- **Booking flow**: Create, reschedule, and manage appointments with confirmations

### Payment Management
- **PayHere integration**: Online payments for channeling and related service fees

### Admin / Staff Management
- **System monitoring**: Operational visibility for admins (activity, bookings, payments)
- **Staff control**: Manage staff roles and permissions (as per system policy)

### Customer Support
- **Ticket-based support**: Issue reporting, tracking, and resolution workflow for patients/staff

### Security
- **Google reCAPTCHA**: Bot mitigation on sensitive/public-facing forms

---

## AI/ML Highlights (AIML Features)

### Disease Prediction & Specialist Suggestion
An ML model trained on symptom inputs predicts probable disease categories and suggests the most relevant **medical department / specialist path**, improving triage and reducing unnecessary referrals.

- **Dataset**: Kaggle **Healthcare Symptoms–Disease Dataset** (used as the foundation for symptom-to-disease learning and evaluation)
- **Outcome**: Faster guidance from symptoms → department suggestion

### Medical Report Explainer (OCR + LLM)
Patients often receive reports containing abbreviations and medical jargon. This module makes reports understandable via:

- **EasyOCR**: Extracts text from uploaded medical report images/PDF scans
- **FastAPI (AI service)**: Serves AI endpoints for OCR + explanation
- **LLM layer (Gemini / Hugging Face)**: Converts clinical terms into patient-friendly explanations and summaries (the repo currently integrates **Gemini**; Hugging Face **Llama** can be swapped in as an alternative inference provider)

---

## Tech Stack

| Layer | Technologies |
|------|--------------|
| **Frontend** | React.js |
| **Backend** | Node.js, Express.js |
| **AI Backend** | FastAPI (Python) |
| **Database** | MySQL (Aiven) |
| **AI/ML** | EasyOCR, Gemini (LLM) / Hugging Face (Llama), Python |
| **Payments** | PayHere |
| **Security** | Google reCAPTCHA |

---

## System Architecture

### How services interact

- **React (Web Client)**: UI for patients, doctors, and staff/admin
- **Node.js/Express API**: Core business logic (appointments, users, payments, support tickets) + MySQL access
- **FastAPI AI Service**: Dedicated AI/ML endpoints (prediction, OCR, report explanations)

### Architecture diagram (Mermaid)

```mermaid
flowchart LR
  U[User (Patient/Doctor/Admin)] -->|Browser| FE[React Web App]

  FE -->|REST/HTTPS| BE[Node.js + Express API]
  BE -->|SQL| DB[(Aiven MySQL)]

  FE -->|AI requests (REST/HTTPS)| AI[FastAPI AI Service]
  AI -->|OCR| OCR[EasyOCR]
  AI -->|LLM inference| HF[Hugging Face (Llama)]

  BE -->|Payment callbacks / verification| PH[PayHere]
  FE -->|Checkout redirect| PH
```

---

## Screenshots (Deployed UI)

Add clean screenshots from `nccecare.vercel.app` for evaluators. Recommended:

1. **Dashboard** (role-based landing page)
2. **Appointment booking flow**
3. **Admin/Staff panel** (monitoring / roster management)
4. **AI Medical Report Explainer** (upload + explanation result)

Place images under `docs/screenshots/` and update the links below:

| Screen | Preview |
|---|---|
| Dashboard | `![Dashboard](docs/screenshots/dashboard.png)` |
| Appointment Booking | `![Booking](docs/screenshots/booking.png)` |
| Admin/Staff | `![Admin](docs/screenshots/admin.png)` |
| AI Report Explainer | `![AI Report Explainer](docs/screenshots/ai-report-explainer.png)` |

---

## Installation Guide (Local Setup)

> This repository contains a React frontend, a Node/Express backend, and a FastAPI AI backend. Run them as separate services during development.

### Prerequisites

- **Node.js**: \(>= 18\)
- **npm** or **yarn**
- **Python**: \(>= 3.10\)
- **MySQL** access (Aiven or local MySQL instance for development)

### 1) Frontend (React)

From the project root (or your frontend directory if separated):

```bash
npm install
npm start
```

- App runs at: `http://localhost:3000`

### 2) Backend (Node.js + Express)

```bash
cd backend
npm install
npm run dev
```

Create `backend/.env` and configure values similar to:

```bash
# Server
PORT=5000
NODE_ENV=development

# Database (Aiven MySQL or local)
DB_HOST=YOUR_DB_HOST
DB_PORT=3306
DB_USER=YOUR_DB_USER
DB_PASSWORD=YOUR_DB_PASSWORD
DB_NAME=YOUR_DB_NAME

# PayHere
PAYHERE_MERCHANT_ID=YOUR_MERCHANT_ID
PAYHERE_SECRET=YOUR_MERCHANT_SECRET
PAYHERE_RETURN_URL=http://localhost:3000/payment/success
PAYHERE_CANCEL_URL=http://localhost:3000/payment/cancel
PAYHERE_NOTIFY_URL=http://localhost:5000/api/payments/notify

# reCAPTCHA
RECAPTCHA_SITE_KEY=YOUR_SITE_KEY
RECAPTCHA_SECRET_KEY=YOUR_SECRET_KEY

# FastAPI AI service URL
AI_SERVICE_URL=http://localhost:8000
```

### 3) AI Backend (FastAPI)

```bash
cd ai-backend
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1

pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Create `ai-backend/.env` and configure values similar to:

```bash
# LLM Provider (current implementation: Gemini)
GEMINI_API_KEY=YOUR_GEMINI_API_KEY

# CORS (optional)
FRONTEND_URL=http://localhost:3000

# Database (used by AI service for doctor suggestions)
DB_HOST=YOUR_DB_HOST
DB_PORT=3306
DB_USER=YOUR_DB_USER
DB_PASSWORD=YOUR_DB_PASSWORD
DB_NAME=YOUR_DB_NAME

# Optional: tuning
MAX_TOKENS=512
TEMPERATURE=0.2
```

### 4) Database setup

- Provision **Aiven MySQL**, or run local MySQL for dev.
- Run the schema script (if provided) from `backend/database_setup.sql`.

### 5) Verify end-to-end locally

- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:5000`
- **AI API**: `http://localhost:8000`

---

## Contributors

> Replace placeholders with your names, roles, and links.

- **Member 1** — Role (e.g., Full-Stack)
- **Member 2** — Role (e.g., Backend)
- **Member 3** — Role (e.g., Frontend)
- **Member 4** — Role (e.g., AI/ML)
- **Member 5** — Role (e.g., QA/DevOps)
- **Member 6** — Role (e.g., UI/UX)

---

## License

This project is licensed under the **MIT License** (or update to your chosen license). See `LICENSE` for details.

---

## Acknowledgments

- **Narammala Channel Centre** for domain requirements and workflow guidance.
- **Kaggle Healthcare Symptoms–Disease Dataset** for symptom/disease training data reference.
- **PayHere** for payment gateway services.
- **Google Gemini** (LLM) and **EasyOCR** for AI-assisted health literacy features.
