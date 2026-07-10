#!/usr/bin/env bash
# ── Render build script ─────────────────────────────────────────────
# Shared by both the Web Service and the Workflow Service.
#
#   Build Command (set in render.yaml / Dashboard):
#     chmod +x bin/render-build.sh && bin/render-build.sh
# ────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> Installing Python dependencies"
pip install --upgrade pip
pip install -r requirements.txt

echo "==> Downloading spaCy language model"
python -m spacy download en_core_web_sm

echo "==> Build complete"
