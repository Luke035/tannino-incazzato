#!/usr/bin/env bash
set -euo pipefail

uv run alembic upgrade head
uv run python scripts/ingest_denominations.py data/denominations.json
uv run python scripts/seed_questions.py data/question_bank.csv
uv run python scripts/backfill_question_classification.py data/question_bank.csv
uv run python scripts/apply_corrections.py
uv run python scripts/promote_admin.py
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
