# MedVerify — Project Context for Claude Code

## What We Are Building
MedVerify is a medical document processing web app that uses a three-agent AI pipeline to automatically extract and verify structured data from medical documents (prior auth forms, fax referrals, clinical notes). The goal is to eliminate human QC review by using three AI agents that cross-examine each other.

## The Three Agent Pipeline
This is the core of the app:
1. EXTRACTOR (Agent 1) — reads the raw document text and extracts all fields into structured JSON. Fields include: patient_name, date_of_birth, drug_name, drug_brand, dosage, frequency, diagnosis_code, diagnosis_description, prescriber_name, prescriber_npi, payer_name, member_id, request_date
2. CRITIC (Agent 2) — reads the SAME raw document text independently, WITHOUT seeing the extractor's output (this is critical — no anchoring bias). Identifies ambiguous fields, potential misreads, missing info, anything uncertain.
3. RESOLVER (Agent 3) — receives the original document + extractor output + critic flags. For each field assigns a verdict: AUTO (confident, no review needed), REVIEW (some ambiguity, human should check), or REJECT (likely wrong). Also assigns a confidence_score 0.0-1.0 and a reason string.

A document is auto-approved only when ALL fields are AUTO. Otherwise it goes to human review queue but only flagged fields are shown — not the whole document.

## Tech Stack
- Backend: Python 3.13, Flask, pymysql, python-dotenv, openai (GPT-4o), pypdf2, werkzeug, gunicorn (production WSGI server)
- Frontend: React 19 with hooks, react-router-dom v7, axios, plain CSS (no Tailwind, no CSS framework — each page has its own `.css` file)
- Database: MySQL 8.0 (local), RDS on AWS (production)
- Deployment: Flask on AWS Elastic Beanstalk (via `backend/Procfile`, gunicorn), React on S3 static hosting, PDFs on S3
- AI: OpenAI GPT-4o via openai Python SDK

## Live Deployment
- Frontend (S3 static site): http://medverify-frontend.s3-website-us-east-1.amazonaws.com
- Backend (Elastic Beanstalk): http://medverify-env.eba-kmdz7qcu.us-east-1.elasticbeanstalk.com
- `frontend/src/api.js` hardcodes `BASE_URL` to the Elastic Beanstalk URL above. For local frontend development against a local Flask server, change it to `http://localhost:5000`.
- Repo is on GitHub: `krish9164/medverify` (git initialized, `origin` remote set).

## Folder Structure
medverify/

├── backend/

│   ├── venv/

│   ├── routes/

│   │   ├── __init__.py

│   │   ├── documents.py       — GET /api/documents, GET /api/document/<id>, POST /api/review/<id>, GET /api/stats

│   │   └── pipeline.py        — POST /api/upload, POST /api/process/<id>

│   ├── services/

│   │   ├── __init__.py

│   │   ├── db.py              — all MySQL access (pymysql, DictCursor, one connection per call)

│   │   └── agents.py          — extractor / critic / resolver agent calls + run_pipeline()

│   ├── uploads/                (gitignored — saved PDFs land here locally)

│   ├── app.py                  Flask app factory, blueprint registration

│   ├── config.py               Config class, loads backend/.env via python-dotenv

│   ├── Procfile                 `web: gunicorn app:app` — used by Elastic Beanstalk

│   ├── .env                     (gitignored — secrets, see Config section below)

│   └── requirements.txt

├── frontend/

│   ├── src/

│   │   ├── api.js              centralizes all axios calls to the backend (see Live Deployment above)

│   │   ├── App.js / App.css    router setup (`/`, `/dashboard`, `/document/:id`) + navbar

│   │   ├── pages/

│   │   │   ├── UploadPage.js / .css       drop zone + upload, three-step processing animation

│   │   │   ├── DashboardPage.js / .css    stats bar (cards double as click-to-filter toggles) + documents table

│   │   │   └── DocumentPage.js / .css     per-document extraction results + inline correction UI

│   │   └── index.js / index.css / setupTests.js / App.test.js — CRA scaffolding

│   └── package.json            Create React App (react-scripts 5.0.1)

├── screenshots/                 clean.jpg, ambiguous.jpg, edit.jpg — referenced from README.md

├── README.md                    public-facing project README (problem, architecture, screenshots, setup)

├── .gitignore

└── CLAUDE.md

## Database Schema (MySQL)
```sql
documents (id, filename, raw_text, status ENUM('processing','auto_approved','needs_review','rejected'), created_at)
extractions (id, document_id, field_name, extracted_value, verdict ENUM('AUTO','REVIEW','REJECT'), confidence_score FLOAT, reason TEXT)
pipeline_runs (id, document_id, extractor_output LONGTEXT, critic_output LONGTEXT, resolver_output LONGTEXT, total_tokens INT, duration_seconds FLOAT, created_at)
corrections (id, extraction_id, original_value, corrected_value, created_at)
```

## API Endpoints
- POST /api/upload — accept PDF, extract text via pypdf2, save to documents table, return document_id
- POST /api/process/<id> — run three agent pipeline on document, save results, return full extraction with verdicts
- GET /api/documents — return all documents with status and created_at
- GET /api/document/<id> — return one document with all its extractions and verdicts
- POST /api/review/<id> — submit human correction for an extraction field
- GET /api/stats — return auto_approval_rate, total_documents, needs_review count

## Config
All secrets are in backend/.env:
- OPENAI_API_KEY
- DB_HOST=localhost
- DB_USER=root
- DB_PASSWORD
- DB_NAME=medverify
- UPLOAD_FOLDER=uploads

Config is loaded via python-dotenv in backend/config.py and accessed via Config class.

## Key Design Decisions
1. Critic agent must NEVER see extractor output — enforced at the prompt level
2. Auto-approval only when every single field verdict is AUTO
3. Human review UI shows ONLY flagged fields, not the whole document
4. Every pipeline run is saved in full to pipeline_runs table for audit trail
5. Corrections are saved separately — future use for few-shot prompt improvement
6. Track total_tokens per run for cost visibility on dashboard
7. Extractor agent discovers fields dynamically — no hardcoded schema. 
   It extracts whatever fields exist in the document. This makes the 
   system work across all medical document types (prior auth, EOB, 
   clinical notes, referral faxes etc.)
8. All three agent calls use `temperature=0` (set in `_call_json_agent` in
   `services/agents.py`) so extraction, critique, and resolution are
   deterministic — the same document produces the same verdicts every run.
9. Dashboard stat cards (Auto Approved / Needs Review / Rejected / Total)
   double as filters for the documents table — clicking one toggles the
   table to show only that status; clicking again (or clicking Total)
   clears the filter. Filtering is client-side against the already-fetched
   document list, no extra API call.

## Current Build Status
- [x] MySQL database and all 4 tables created
- [x] Backend folder structure created
- [x] Flask app skeleton in app.py and config.py
- [x] services/db.py — database helper functions
- [x] services/agents.py — three agent pipeline
- [x] routes/pipeline.py — upload and process endpoints
- [x] routes/documents.py — documents, stats, review endpoints
- [x] React frontend
- [x] AWS deployment
- [x] README.md written