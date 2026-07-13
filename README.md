
# 🛡️ Sentinel BugFix

> **Autonomous Multi-Agent Bug Detection, Validation & GitHub PR Generation Platform built natively on Render**

<div align="center">

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-green)
![LangGraph](https://img.shields.io/badge/LangGraph-Orchestration-orange)
![Render](https://img.shields.io/badge/Render-Cloud-purple)
![Redis](https://img.shields.io/badge/Redis-State-red)

</div>

---

# 🚀 Overview

Sentinel BugFix is an autonomous AI software engineering platform that continuously analyzes repositories, reproduces failures, investigates root causes, generates fixes, validates them, performs security scanning, and prepares merge-ready GitHub Pull Requests.

Unlike traditional AI coding assistants, Sentinel executes a **complete software engineering workflow** through specialized AI agents orchestrated with **LangGraph** and deployed **natively on Render**.

---

# 🏆 Why Render?

Render is not simply the hosting platform—it is the execution backbone of Sentinel.

| Render Service | Purpose |
|---------------|---------|
| **Render Web Service** | Hosts FastAPI APIs and WebSocket endpoints |
| **Render Background Worker** | Executes long-running LangGraph workflows independently from HTTP requests |
| **Render Redis** | Stores workflow checkpoints, retries, execution state and agent outputs |
| **Environment Variables** | Secure API key and secret management |
| **GitHub Auto Deploy** | Automatic deployment after every push |
| **Build Pipeline** | Installs dependencies, validation tools and spaCy model |
| **Logs & Monitoring** | Real-time debugging and workflow visibility |

---

# ☁️ Render Architecture

```text
                     GitHub Repository
                            │
                            ▼
                    Render Auto Deploy
                            │
          ┌─────────────────┴─────────────────┐
          │                                   │
          ▼                                   ▼
   Render Web Service              Render Background Worker
        FastAPI                    LangGraph Agent Pipeline
          │                                   │
          └───────────────┬───────────────────┘
                          │
                    Render Redis
             Workflow State & Checkpoints
                          │
                          ▼
                 GitHub Pull Requests
```

---

# 🤖 Multi-Agent Pipeline

| Agent | Responsibility |
|------|----------------|
| A0 | Repository Preparation |
| A1 | Semantic Intent Graph |
| A2 | Dependency Analysis |
| A3 | Static Analysis |
| A3.5 | Bug Reproduction |
| A4 | Evidence Investigation |
| A5 | Blast Radius Analysis |
| A6 | Repair Planning |
| A7 | AI Patch Generation |
| A8 | Validation & Mutation Testing |
| A9 | Security Rescan |
| A10 | Mergeability & PR Generation |

---

# 🏗️ Technology Stack

- FastAPI
- LangGraph
- Redis
- Render
- Mistral AI
- Anthropic
- NetworkX
- GitPython
- PyGithub
- spaCy
- Pytest
- Mutmut
- Bandit
- Semgrep

---

# 📁 Repository Structure

```text
backend/
 ├── agents/
 ├── orchestrator/
 ├── services/
 ├── state/
 └── api/

workflow/
tests/
vulnapi/
docs/
pyproject.toml
render.yaml
README.md
```

---

# ⚙️ Local Development

```bash
git clone https://github.com/<username>/sentinel-bugfix.git
cd sentinel-bugfix

python -m venv .venv

source .venv/bin/activate

pip install -e ".[dev]"

python -m spacy download en_core_web_sm
```

---

# 🔐 Environment Variables

```env
LLM_PROVIDER=mistral
MISTRAL_API_KEY=
MISTRAL_MODEL=codestral-latest

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4

REDIS_URL=redis://localhost:6379

GITHUB_TOKEN=

STUB_MODE=false
GITHUB_DRY_RUN=true
```

---

# ▶️ Running Locally

Start Redis

```bash
brew services start redis
```

Run API

```bash
uvicorn backend.main:app --reload
```

Create a workflow

```bash
curl -X POST http://127.0.0.1:8000/runs \
-H "Content-Type: application/json" \
-d '{"repo_path":"vulnapi"}'
```

---

# 🚀 Deploying on Render

## Build Command

```bash
pip install .
python -m spacy download en_core_web_sm
```

## Start Command

```bash
python workflow/main.py
```

or

```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

## Required Render Services

- Render Web Service
- Render Background Worker
- Render Redis

---

# 🔄 Workflow Execution

```text
POST /runs
      │
      ▼
Render API
      │
      ▼
Redis Queue
      │
      ▼
Render Worker
      │
      ▼
LangGraph
      │
      ▼
A0 → A10
      │
      ▼
Validation
      │
      ▼
Security Scan
      │
      ▼
GitHub Pull Request
```

---

# 🔍 Validation Pipeline

```text
Patch Generation
      │
      ▼
Pytest
      │
      ▼
Mutation Testing
      │
      ▼
Bandit
      │
      ▼
Semgrep
      │
      ▼
Mergeability Score
```

---

# 🌐 API

| Endpoint | Description |
|----------|-------------|
| POST /runs | Start workflow |
| GET /runs/{id} | Run status |
| GET /runs/{id}/sig | Semantic Intent Graph |
| GET /runs/{id}/events | Timeline |
| WS /ws/runs/{id} | Live execution |
| GET /health | Health |

---

# 📈 Key Features

- Autonomous AI software engineering
- Parallel multi-agent execution
- Redis checkpointing
- Retry-aware validation
- Mutation testing
- Security rescanning
- GitHub PR generation
- Live WebSocket updates
- Render-native deployment
- Production-ready orchestration

---

# 🛣️ Roadmap

- Docker sandbox execution
- Kubernetes deployment
- Multi-language support
- Human review dashboard
- IDE extension
- Multi-repository analysis

---

# 🤝 Contributing

1. Fork
2. Create feature branch
3. Commit
4. Push
5. Open Pull Request

---

# 📄 License

MIT

---

# 👨‍💻 Author

**Chelvachezhiyan S N**

AI & Data Science Engineer

---

## Built For

**Render Hackathon**

Sentinel demonstrates how Render's managed infrastructure can power autonomous, long-running AI agent systems capable of end-to-end software maintenance with minimal human intervention.
