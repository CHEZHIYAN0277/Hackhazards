
# Sentinel BugFix

> Autonomous Multi-Agent Bug Detection, Repair & GitHub Pull Request Generation Platform

---

## Overview

Sentinel BugFix is an autonomous AI software engineering system that analyzes repositories, reproduces failures, investigates root causes, generates patches, validates them using automated testing and security scanning, and produces merge-ready GitHub Pull Requests.

### Highlights

- Multi-Agent Architecture (10+ agents)
- LangGraph Orchestration
- FastAPI Backend
- Redis State Persistence
- Semantic Intent Graph
- Root Cause Investigation
- Automated Patch Generation
- Pytest Validation
- Mutation Testing
- Bandit + Semgrep Security Scanning
- GitHub PR Automation
- Live WebSocket Execution Timeline

---

## Architecture

```text
Repository
   │
   ▼
A0 Repository Preparation
   │
   ▼
A1 Semantic Mapper
A2 Dependency Analyzer
A3 Static Analysis
   │
   ▼
A3.5 Reproduction Gate
   │
   ▼
A4 Evidence Investigator
   │
   ▼
A5 Blast Radius
   │
   ▼
A6 Repair Planner
   │
   ▼
A7 Code Generator
   │
   ▼
A8 Mutation Validator
   │
   ▼
A9 Security Rescan
   │
   ▼
A10 Mergeability Router
   │
   ▼
GitHub Pull Request
```

---

## Tech Stack

| Layer | Technologies |
|------|--------------|
| Backend | FastAPI |
| AI | Mistral, Anthropic |
| Orchestration | LangGraph |
| Storage | Redis |
| Validation | Pytest, Mutmut |
| Security | Bandit, Semgrep |
| Graphs | NetworkX |
| NLP | spaCy |

---

## Installation

```bash
git clone https://github.com/<username>/sentinel-bugfix.git
cd sentinel-bugfix

python -m venv .venv
source .venv/bin/activate

pip install -e ".[dev]"

python -m spacy download en_core_web_sm
```

---

## Environment

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

## Run

```bash
brew services start redis

uvicorn backend.main:app --reload
```

Create a pipeline run:

```bash
curl -X POST http://127.0.0.1:8000/runs -H "Content-Type: application/json" -d '{"repo_path":"vulnapi"}'
```

---

## API

| Endpoint | Description |
|----------|-------------|
| POST /runs | Start pipeline |
| GET /runs/{id} | Status |
| GET /runs/{id}/sig | Semantic Intent Graph |
| GET /runs/{id}/events | Event Timeline |
| WS /ws/runs/{id} | Live Events |
| GET /health | Health Check |

---

## Validation Pipeline

Patch → Pytest → Mutation Testing → Bandit → Semgrep → Mergeability Score

---

## Roadmap

- Docker sandbox
- Multi-language support
- Kubernetes deployment
- IDE extension
- Human review dashboard
- Cloud deployment

---

## License

MIT

---

## Author

Chelvachezhiyan S N
