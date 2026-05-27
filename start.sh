#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[start]${NC} $1"; }
warn() { echo -e "${YELLOW}[start]${NC} $1"; }
die()  { echo -e "${RED}[start]${NC} $1" >&2; exit 1; }

# ── env file checks ───────────────────────────────────────────────────────────
if [[ ! -f "$ROOT/backend/.env" ]]; then
    cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
    die "Created backend/.env from example — fill in GEMINI_API_KEY and re-run."
fi

if [[ ! -f "$ROOT/frontend/.env.local" ]]; then
    cp "$ROOT/frontend/.env.local.example" "$ROOT/frontend/.env.local"
    warn "Created frontend/.env.local with default API URL."
fi

# ── dependencies ──────────────────────────────────────────────────────────────
log "Syncing Python dependencies..."
(cd "$ROOT/backend" && uv sync --quiet)

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
    log "Installing Node dependencies..."
    (cd "$ROOT/frontend" && npm install --silent)
fi

# ── PostgreSQL ────────────────────────────────────────────────────────────────
log "Starting PostgreSQL..."
docker compose -f "$ROOT/infra/docker-compose.yml" up -d

log "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
    if docker compose -f "$ROOT/infra/docker-compose.yml" exec -T db \
        pg_isready -U sommelier -q 2>/dev/null; then
        log "PostgreSQL is ready."
        break
    fi
    [[ $i -eq 30 ]] && die "PostgreSQL did not become ready within 30 seconds."
    sleep 1
done

# ── migrations + ingestion ────────────────────────────────────────────────────
log "Running Alembic migrations..."
(cd "$ROOT/backend" && uv run alembic upgrade head)

log "Ingesting denominations..."
(cd "$ROOT/backend" && uv run python scripts/ingest_denominations.py \
    "$ROOT/backend/data/denominations.json")

# ── services ──────────────────────────────────────────────────────────────────
log "Starting FastAPI backend  →  http://localhost:8000"
(cd "$ROOT/backend" && uv run fastapi dev app/main.py 2>&1 | sed 's/^/[backend] /') &
BACKEND_PID=$!

log "Starting Next.js frontend →  http://localhost:3000"
(cd "$ROOT/frontend" && npm run dev 2>&1 | sed 's/^/[frontend] /') &
FRONTEND_PID=$!

# ── cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
    echo ""
    log "Shutting down backend and frontend..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    log "Done. PostgreSQL container left running (docker compose -f infra/docker-compose.yml stop to halt it)."
}
trap cleanup EXIT INT TERM

log "All services started. Press Ctrl+C to stop."
wait
