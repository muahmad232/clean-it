# Clean-It 🧹 | Data Quality, Profiling & Autonomous Preparation Engine

[![Live Application](https://img.shields.io/badge/Live%20Demo-Vercel%20Deployment-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://clean-it-all.vercel.app/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.141.1-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Polars](https://img.shields.io/badge/Polars-1.30.0-CD792C?style=for-the-badge&logo=polars&logoColor=white)](https://pola.rs)
[![Groq AI](https://img.shields.io/badge/Groq%20LLM-Qwen%203.8--27B-F05A28?style=for-the-badge)](https://groq.com)
[![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Storage-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

> **Live Deployment:** [Clean-It | Data Quality & Preparation Engine](https://clean-it-all.vercel.app/)

**Clean-It** is an enterprise-grade, resource-efficient tabular data quality, profiling, and preparation platform. Built around an **agentic self-healing workflow**, Clean-It decouples statistical computation from generative reasoning: **Polars** executes high-speed, deterministic mathematical operations directly on lazy streaming dataframes, while high-throughput **Groq LLM models** perform high-level planning, anomaly triage, dynamic pipeline orchestration, and remediation verification.

Every transformation is **explainable, audited, mathematically verified, gated by human approval for destructive operations, and 100% reversible**.

---

## 📑 Table of Contents

- [Key Highlights & Architectural Principles](#-key-highlights--architectural-principles)
- [System Architecture](#-system-architecture)
- [Core Platform Capabilities (The 8 Modes)](#-core-platform-capabilities-the-8-modes)
- [The 13 Deterministic Issue Detectors](#-the-13-deterministic-issue-detectors)
- [The 4-Factor Quality Score Formula](#-the-4-factor-quality-score-formula)
- [Technology Stack](#-technology-stack)
- [Repository Structure](#-repository-structure)
- [Local Development Setup](#-local-development-setup)
- [Environment Variables Guide](#-environment-variables-guide)
- [Running Backend Tests](#-running-backend-tests)
- [Production Deployment](#-production-deployment)
- [API Reference](#-api-reference)
- [Security & Governance](#-security--governance)

---

## 🌟 Key Highlights & Architectural Principles

1. **Deterministic Separation of Labour**:
   - **Reasoning Tier**: LLMs reason over compact, structured statistical fingerprints (~800 tokens). They *never* calculate raw numbers or hallucinate metrics.
   - **Execution Tier**: Polars lazy frames stream and transform tabular datasets in-memory with exact precision and zero numeric hallucinations.
   - **Safety Tier**: Regression detectors compare before-and-after quality deltas. If an action degrades data quality by >5 points or triggers catastrophic row drops, the pipeline automatically rolls back and re-plans.
2. **Zero-Target Leakage & Holdout ML Evaluation**:
   - Automatically detects surrogate keys, auto-increment IDs, UUIDs, and feature correlations with targets (|r| ≥ 0.90) to prevent models from memorizing artificial index shortcuts.
   - Benchmarks models on a **strictly isolated 80/20 train/test split partitioned prior to cleaning**, preventing synthetic data leakage.
3. **AST-Sandboxed Dynamic Transformations**:
   - Natural language user requests that require novel transformations are compiled into isolated Python functions (`def transform(df: pl.DataFrame) -> pl.DataFrame`).
   - Validated against an Abstract Syntax Tree (AST) security barrier that rejects all imports (`ast.Import`, `ast.ImportFrom`), system builtins (`eval`, `exec`, `open`), and file/network I/O.
4. **Immutable Version Lineage**:
   - Raw source datasets are stored read-only in object storage. Each cleaning iteration creates a distinct, immutable Parquet snapshot enabling one-click reversible rollback.
5. **Memory-Safe Architecture**:
   - Lazy streaming evaluations, chunked aggregations, and zero-copy columnar memory layouts ensure zero out-of-memory (OOM) crashes even on memory-constrained servers.

---

## 🏗️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CLEAN-IT PIPELINE LIFECYCLE                     │
└────────────────────────────────────────────────────────────────────────┘

 [ Raw Dataset Upload ] (CSV / JSON / Parquet ≤ 50MB)
           │
           ▼
 [ Streaming Ingestion Guard ] ── Magic byte check, header validation & encoding sanitization
           │
           ▼
 [ Polars Profiler ] ──────────── Lazy streaming scan for shape, null ratios, quantiles & memory
           │
           ▼
 [ 13 Issue Detectors ] ──────── Evaluates exact duplicates, skew, leakage, type anomalies
           │
           ▼
 [ Compact Fingerprint ] ──────── Synthesizes ~800-token statistical context for LLM
           │
           ▼
 ┌───────────────── GROQ AGENTIC REASONING LOOP ────────────────────────┐
 │                                                                       │
 │   1. Reason & Plan  ───────►  Select registered Polars tools         │
 │                                                                       │
 │   2. Risk Assessment ──────►  Low Risk  ───► Automatic Execution      │
 │                               High Risk ──► Pauses for Human Approval │
 │                                                                       │
 │   3. Tool Execution ───────►  Deterministic vectorized mutations     │
 │                                                                       │
 │   4. Re-Profiling ─────────►  Computes 4-Factor Quality Score Delta   │
 │                                                                       │
 │   5. Self-Healing Guard ───►  Score Dropped > 5.0?                    │
 │                                 ├─ YES: Auto-Rollback & Re-plan       │
 │                                 └─ NO:  Accept Version Snapshot       │
 └───────────────────────────────────────────────────────────────────────┘
           │
           ▼
 [ 80/20 Holdout ML Benchmark ] ── Trains Baseline vs Cleaned Models (Zero Leakage)
           │
           ▼
 [ Comprehensive Audit Report ] ── JSON & Print-Ready HTML / Clean CSV Export
```

---

## ⚡ Core Platform Capabilities (The 8 Modes)

Clean-It features **8 specialized operating modes** available within the Data Cleaning Center:

| # | Feature Mode | Core Function | Engine & Under the Hood | Safety & Best Use |
|:-:|:---|:---|:---|:---|
| **1** | **Autonomous AI Cleaning Loop** | Multi-iteration self-healing defect repair | Groq LLM plans tools &rarr; Polars executes &rarr; quality re-profiled &rarr; regression triggers auto-rollback. | Autopilot remediation with automatic recovery from destructive steps. |
| **2** | **Intent-Guided Chat & Custom Tasks** | Natural language custom requirements | Translates user prompts into registered tools or safe dynamic functions (`def transform(df)`). | Sandboxed via Python AST. All dynamic scripts require human approval. |
| **3** | **Instant Standard Clean** | Instant heuristic remediation | Pure in-memory Polars rules: duplicate purge, median/mode imputation, type fixes, whitespace strip. | 0 AI latency, 0 token consumption. Perfect for quick initial cleaning. |
| **4** | **Read-Only Diagnostic Reasoning** | Comprehensive quality health check | Inspects statistical metadata to provide an A–F grade, readiness score (0–100), and remediation plan. | 100% read-only. Does not modify a single byte of data. |
| **5** | **Reversible Version Lineage** | Non-destructive snapshot history | Every cleaning run writes an immutable compressed Parquet snapshot. Allows single-click rollback. | Raw data is permanent. Experiment freely with zero risk of data loss. |
| **6** | **Before / After Verification** | Mathematical comparison delta | Calculates transparent 4-factor Quality Score improvements (0–100) and column-level metrics. | Eliminates black-box claims with itemized mathematical proof. |
| **7** | **ML Holdout Generalization Benchmark** | Machine learning impact evaluation | Splits data 80/20 train/test *before* cleaning. Fits baseline vs cleaned models to measure F1, R², RMSE. | Guaranteed zero target leakage and zero test-set contamination. |
| **8** | **Comprehensive Audit & Compliance** | Verifiable governance documentation | Assembles detected anomalies, human decisions, execution logs, and quality deltas into JSON/HTML. | Single-click export for regulatory compliance and stakeholder reviews. |

---

## 🔍 The 13 Deterministic Issue Detectors

Clean-It evaluates tabular datasets against 13 deterministic issue detectors implemented directly in Polars without arbitrary code generation:

| Issue Detector | Trigger Rule | Severity Scale | Engineering & ML Impact |
|:---|:---|:---|:---|
| `MISSING_VALUES` | `null_pct > 0.0%` | Low (<5%) to Critical (≥60%) | Flags sparse features for median/mode imputation or column elimination. |
| `DUPLICATES` | `duplicate_rows > 0` | Low (<2%) to Critical (≥25%) | Removes identical rows to prevent sample bias and artificial model confidence. |
| `CONSTANT_COLUMN` | `n_unique == 1` | High | Eliminates zero-variance features that cause singular matrices and waste RAM. |
| `NEAR_CONSTANT_COLUMN` | `top_val_freq > 95%` | Medium | Warns against extreme distribution skew and low statistical entropy. |
| `POSSIBLE_IDENTIFIER` | `unique_pct == 100%` | High for ML | Purges unique IDs and sequential keys that cause trivial target leakage. |
| `HIGH_CARDINALITY` | `unique_pct > 50%` | Medium | Prevents dimensionality explosion from naive one-hot encoding. |
| `TYPE_MISMATCH` | String matches ≥80% numbers/dates | Medium to High | Auto-casts numeric strings or formatted dates misparsed during ingestion. |
| `OUTLIER` | IQR rule or \|z\| > 3.0 | Low to High | Detects extreme tails that distort linear models, variance, and distance metrics. |
| `INVALID_RANGE` | Domain constraint violations | Low to High | Catches impossible domain values (e.g. negative age, negative prices, probabilities > 100%). |
| `DISTRIBUTION_SHIFT` | KS distance ≥ 0.25 or TVD ≥ 0.25 | Medium to High | Detects severe post-transformation feature drift compared to baseline. |
| `CLASS_IMBALANCE` | Majority-to-minority ratio ≥ 4:1 | Medium to High | Flags extreme target category skew that causes classification collapse. |
| `TARGET_LEAKAGE` | Feature correlation \|r\| ≥ 0.90 with target | High to Critical | Removes features suspiciously correlated with targets that cause overfitting. |
| `DATE_PARSE_ERROR` | Conflicting timestamp syntax | Medium to High | Detects corrupt timestamps and invalid calendar dates (e.g. Feb 30). |

---

## 📊 The 4-Factor Quality Score Formula

Every dataset version receives a composite **Quality Score (0 – 100)** calculated transparently:

$$\text{Quality Score} = (0.35 \times \text{Completeness}) + (0.25 \times \text{Type Consistency}) + (0.20 \times \text{Uniqueness}) + (0.20 \times \text{Validity})$$

- **Completeness (35%)**: Evaluates missing value density across all cells:
  $$\text{Completeness} = 100 \times \left(1 - \frac{\sum \text{Null Cells}}{\text{Total Cells}}\right)$$
- **Type Consistency (25%)**: Penalizes columns with mixed types or numeric data stored as strings:
  $$\text{Type Consistency} = 100 \times \left(1 - \frac{\text{Misinferred Columns}}{\text{Total Columns}}\right)$$
- **Uniqueness (20%)**: Measures the ratio of distinct records:
  $$\text{Uniqueness} = 100 \times \left(1 - \frac{\text{Duplicate Rows}}{\text{Total Rows}}\right)$$
- **Validity (20%)**: Assesses range adherence, outlier proportions, and identifier hygiene:
  $$\text{Validity} = 100 \times \left(1 - \frac{\text{Invalid Range Rows} + \text{Severe Outlier Rows}}{\text{Total Rows}}\right)$$

---

## 💻 Technology Stack

### Frontend
- **Framework**: React 19 + Vite 8
- **Styling**: Curated Vanilla CSS tokens (dark mode, glassmorphism, micro-animations)
- **Icons**: Lucide React
- **Authentication**: Supabase Auth (Email/Password + Google OAuth)
- **Deployment**: Vercel (`clean-it-all.vercel.app`)

### Backend
- **Framework**: FastAPI (Python 3.12, ASGI asynchronous runtime)
- **Data Engine**: Polars 1.30 (vectorized lazy streaming frames written in Rust)
- **AI / LLM Engine**: Groq SDK (`qwen/qwen3.8-27b`)
- **Machine Learning**: Scikit-learn (RandomForest, Ridge/Lasso, Logistic Regression) & Scipy
- **Database & Storage**: Supabase (PostgreSQL schema `data_agent` + Supabase Storage)
- **Validation**: Pydantic v2 & Pydantic-Settings
- **Deployment**: Render Web Service

---

## 📁 Repository Structure

```text
clean-it/
├── .python-version               # Pinned Python 3.12.9 runtime
├── render.yaml                   # 1-Click Render Blueprint infrastructure spec
│
├── frontend/                     # React + Vite Single Page Application
│   ├── public/                   # Static public assets
│   ├── src/
│   │   ├── components/           # Reusable UI components
│   │   │   ├── CleanActionCard.jsx
│   │   │   ├── DataCleaningCenter.jsx  # Primary 8-mode cleaning command hub
│   │   │   ├── Navbar.jsx              # Navigation header with profile controls
│   │   │   ├── ProfileStats.jsx        # Streaming Polars profile metric cards
│   │   │   └── ...
│   │   ├── pages/                # Application views
│   │   │   ├── AboutPage.jsx     # Comprehensive Methodology & Operating Guide
│   │   │   ├── HomePage.jsx      # Interactive benchmarks & ingestion hero
│   │   │   ├── InfoPage.jsx      # Architecture & 13 detector rules reference
│   │   │   ├── ProjectsPage.jsx  # Workspace dataset manager & version trees
│   │   │   └── StudioPage.jsx    # Live data profiler & cleaning studio
│   │   ├── api.js                # Unified FastAPI client & environment resolver
│   │   ├── supabase.js           # Supabase client & OAuth session synchronizer
│   │   ├── index.css             # Design tokens, variables & typography
│   │   └── main.jsx
│   ├── .env.example              # Frontend environment configuration template
│   ├── package.json
│   ├── vercel.json               # SPA routing rewrite & cache header config
│   └── vite.config.js
│
└── backend/                      # FastAPI Python Application
    ├── app/
    │   ├── core/                 # App configuration & logging handlers
    │   │   ├── config.py         # Type-validated Pydantic settings & CORS
    │   │   └── logging.py
    │   ├── database/             # Supabase PostgreSQL client & repositories
    │   │   ├── client.py
    │   │   └── repositories/     # Datasets, issues, approvals, versions repo
    │   ├── models/               # Pydantic request/response schemas
    │   ├── routers/              # API endpoints
    │   │   ├── approvals.py      # Human approval decisions
    │   │   ├── clean.py          # Instant & autonomous cleaning routes
    │   │   ├── comparison.py     # Before/after re-profiling & delta scoring
    │   │   ├── evaluation.py     # 80/20 holdout ML generalization benchmark
    │   │   ├── llm.py            # Diagnostic reasoning & Groq LLM integration
    │   │   ├── profile.py        # Polars lazy profiler routes
    │   │   ├── report.py         # Comprehensive audit export (JSON / HTML)
    │   │   ├── upload.py         # File validation & storage upload
    │   │   └── versions.py       # Snapshot lineage & rollback routes
    │   ├── services/             # Core business logic
    │   │   ├── cleaner.py        # Vectorized Polars deterministic tool implementations
    │   │   ├── dynamic_executor.py # AST-sandboxed dynamic Python function execution
    │   │   ├── issue_detector.py # 13 Polars deterministic anomaly detectors
    │   │   ├── ml_evaluator.py   # Holdout benchmark split & model training
    │   │   ├── profiler.py       # Streaming metadata & quantile scanner
    │   │   ├── rollback.py       # Version snapshot re-pointing & recovery
    │   │   └── self_healing.py   # Autonomous regression detector & re-planner
    │   ├── storage/              # Supabase storage bucket interface
    │   └── main.py               # FastAPI entry-point & lifespan lifecycle
    ├── migrations/               # PostgreSQL DDL migrations (data_agent schema)
    ├── tests/                    # Comprehensive Pytest suite (229 tests)
    ├── .env.example              # Backend environment configuration template
    ├── requirements.txt          # Production dependencies
    └── pyproject.toml
```

---

## 🛠️ Local Development Setup

### Prerequisites
- **Node.js**: v18+ (v20 recommended)
- **Python**: v3.11 or v3.12 (v3.12.9 recommended)
- **Supabase Account**: A free project with Storage & PostgreSQL
- **Groq API Key**: Free API key from [console.groq.com](https://console.groq.com)

---

### 1. Clone the Repository
```bash
git clone https://github.com/muahmad232/clean-it.git
cd clean-it
```

---

### 2. Backend Setup
```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
```

Configure your `.env` with your Supabase and Groq credentials (see [Environment Variables Guide](#-environment-variables-guide)).

Run database migrations in the Supabase SQL Editor: execute the SQL script in [`backend/migrations/001_initial_schema.sql`](backend/migrations/).

Start the development backend:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
The API is now running at `http://127.0.0.1:8000`. Test health: `http://127.0.0.1:8000/health`.

---

### 3. Frontend Setup
```bash
# Open a new terminal and navigate to frontend
cd frontend

# Install dependencies
npm install

# (Optional) Create .env
cp .env.example .env

# Start Vite dev server
npm run dev
```
Open `http://localhost:3000` in your browser. In local development, requests to `/api` and `/health` are proxied automatically to `http://127.0.0.1:8000`.

---

## 🔑 Environment Variables Guide

### Backend (`backend/.env`)
| Variable | Required | Description | Example |
|:---|:---:|:---|:---|
| `ENVIRONMENT` | Yes | App mode (`development` or `production`) | `development` |
| `LOG_LEVEL` | No | Logging verbosity | `INFO` |
| `CORS_ORIGINS` | Yes | Allowed origins or `*` | `*` or `https://clean-it-all.vercel.app` |
| `GROQ_API_KEY` | Yes | API key from Groq Console | `gsk_...` |
| `GROQ_MODEL` | No | Fast LLM model identifier | `qwen/qwen3.8-27b` |
| `SUPABASE_URL` | Yes | Supabase Project URL | `https://xyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes | Supabase Public Anonymous Key | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase Service Role Secret Key | `eyJhbGci...` |
| `SUPABASE_DB_URL` | Yes | Postgres connection string | `postgresql://postgres:...` |
| `MAX_UPLOAD_SIZE_MB` | No | Upload threshold (default: 50MB) | `50` |
| `MAX_ROWS` | No | Row cap before chunked sampling | `500000` |
| `MAX_COLUMNS` | No | Column limit | `150` |

### Frontend (`frontend/.env`)
| Variable | Required in Prod | Description | Example |
|:---|:---:|:---|:---|
| `VITE_API_URL` | **Yes (on Vercel)** | Full URL of your deployed Render backend | `https://clean-it-3cag.onrender.com` |
| `VITE_SUPABASE_URL` | No | Optional client-side Supabase URL | `https://xyz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | No | Optional client-side Supabase anon key | `eyJhbGci...` |

*(Note: In local development, `VITE_API_URL` can be left blank because Vite proxies `/api` and `/health` to `http://127.0.0.1:8000`).*

---

## 🧪 Running Backend Tests

The project includes an end-to-end test suite covering profilers, issue detectors, dynamic execution safety, ML holdout evaluation, self-healing agent loops, and audit exports:

```bash
cd backend
.\.venv\Scripts\Activate.ps1   # (or source .venv/bin/activate)

# Run full test suite
pytest -v

# Run with quiet summary
pytest -q
```

**Test Suite Coverage Status**:
```text
229 passed, 3 warnings in 05:38s
100% Passing Status
```

---

## 🚀 Production Deployment

### 1. Backend on Render
1. Create a **New Web Service** connected to your GitHub repository.
2. Configure settings:
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
3. Add environment variables from `backend/.env.example` (`GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS=*`).
4. Note your Render URL: `https://clean-it-3cag.onrender.com`.

### 2. Frontend on Vercel
1. Import the repository on [vercel.com](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Framework Preset: `Vite`.
4. In **Environment Variables**, add:
   - `VITE_API_URL`: `https://clean-it-3cag.onrender.com`
5. Click **Deploy**.
6. Access the live platform: [Clean-It | Data Quality & Preparation Engine](https://clean-it-all.vercel.app/).

---

## 📡 API Reference

A sample of primary REST endpoints exposed by Clean-It:

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/health` | Liveness probe & live database connectivity ping |
| `GET` | `/api/v1/limits` | Hardware budgets, upload caps, and allowed file formats |
| `POST` | `/api/v1/projects/{p_id}/datasets/upload` | Validates, inspects, and stores uploaded dataset |
| `POST` | `/api/v1/projects/{p_id}/datasets/{d_id}/profile` | Executes Polars streaming profiler |
| `GET` | `/api/v1/projects/{p_id}/datasets/{d_id}/issues` | Returns structured 13-detector issue findings |
| `POST` | `/api/v1/projects/{p_id}/datasets/{d_id}/clean` | Executes Instant standard heuristic cleaning |
| `POST` | `/api/v1/projects/{p_id}/datasets/{d_id}/self-heal` | Runs autonomous multi-iteration agent loop |
| `POST` | `/api/v1/projects/{p_id}/datasets/{d_id}/chat-clean` | Executes natural language instructions with AST checks |
| `POST` | `/api/v1/projects/{p_id}/datasets/{d_id}/evaluate-ml` | Trains baseline vs cleaned models on 80/20 holdout split |
| `GET` | `/api/v1/projects/{p_id}/datasets/{d_id}/compare` | Calculates 4-factor Quality Score delta between versions |
| `POST` | `/api/v1/projects/{p_id}/datasets/{d_id}/rollback` | Rolls back dataset pointer to any historic version |
| `GET` | `/api/v1/projects/{p_id}/datasets/{d_id}/report` | Generates comprehensive audit report (JSON or HTML) |

---

## 🛡️ Security & Governance

- **AST Security Guard**: Custom user code generated by LLMs is parsed with Python's `ast` module before execution. Any use of `import`, `exec`, `eval`, `open`, `os`, `sys`, `subprocess`, `requests`, or filesystem access is terminated immediately.
- **Human-in-the-Loop Safeguards**: High-risk operations (dropping columns, severe row pruning, clipping distributions) pause the autonomous agent and require manual approval.
- **Non-Destructive Storage**: Original raw datasets are marked read-only in object storage. All cleaning operations write to versioned snapshots (`v1`, `v2`, ...).
- **Auto-Rollback on Regression**: If an agent action drops the composite Quality Score by >5.0 points or causes an unexpected row drop, the engine rolls back and re-plans.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  <b>Clean-It</b> — Autonomous, Transparent, and Mathematically Verified Data Preparation.
  <br>
  <a href="https://clean-it-all.vercel.app/"><b>Try the Live Application &rarr;</b></a>
</p>
