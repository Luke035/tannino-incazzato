#!/usr/bin/env bash
set -euo pipefail

uv run alembic upgrade head
uv run python scripts/ingest_denominations.py data/denominations.json
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
