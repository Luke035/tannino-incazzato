# Architecture Refactor Plan

## Goal

Introduce a standard 3-layer architecture (frontend / backend / database) to replace the current monolithic Next.js application. The scope of this refactor is **structural only** — no new features, no authentication, no new games. The app must behave identically after the refactor. Future work (auth, user pages, new games) will build on top of this foundation.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Repo layout | Monorepo (this repo) | One developer, atomic commits across layers |
| Folder structure | `/frontend`, `/backend`, `/infra` | Symmetric, scales cleanly when more services arrive |
| Backend language | Python + FastAPI | Chosen by user |
| ORM | SQLModel | Single class = DB table + Pydantic schema; pairs naturally with FastAPI |
| Migrations | Alembic | Standard tool for SQLAlchemy/SQLModel; auto-generates scripts |
| Database | PostgreSQL | Docker-managed locally; full containerisation deferred |
| Python deps | uv | Fast, modern, lock-file included |
| Frontend | Next.js (unchanged) | Just moved to `/frontend` |
| Frontend → backend | Direct browser calls to FastAPI | Single server-side layer; no Next.js proxy |
| Session state | Stays client-side | Persistence requires auth; deferred to auth phase |
| Data ingestion | One-off CLI script | Reads `denominations.json` → PostgreSQL |

---

## Target Folder Structure

```
sommelier_game/
├── frontend/                        # Next.js project (moved from repo root)
│   ├── src/
│   │   ├── app/
│   │   │   └── [locale]/            # Setup, game, recap screens (unchanged)
│   │   │   # NOTE: src/app/api/ is removed — all API routes move to FastAPI
│   │   ├── components/              # Unchanged
│   │   ├── lib/
│   │   │   ├── api.ts               # Updated: fetch calls point to NEXT_PUBLIC_API_URL
│   │   │   └── ...                  # Other lib files unchanged
│   │   ├── data/                    # denominations.json kept as migration source only
│   │   └── ...
│   ├── package.json
│   └── .env.local                   # NEXT_PUBLIC_API_URL=http://localhost:8000
│
├── backend/
│   ├── app/
│   │   ├── denominations/
│   │   │   ├── __init__.py
│   │   │   ├── model.py             # SQLModel table definition + Pydantic response schema
│   │   │   └── router.py            # GET /denominations
│   │   ├── ai/
│   │   │   ├── __init__.py
│   │   │   ├── router.py            # POST /hint, POST /memorize, POST /review
│   │   │   └── gemini.py            # Gemini prompt functions (ported from src/lib/gemini.ts)
│   │   ├── __init__.py
│   │   ├── database.py              # SQLModel engine + get_session dependency
│   │   └── main.py                  # FastAPI app init, CORS middleware, router registration
│   ├── alembic/
│   │   ├── versions/                # Auto-generated migration scripts live here
│   │   └── env.py                   # Alembic env — imports SQLModel metadata
│   ├── scripts/
│   │   └── ingest_denominations.py  # One-off: reads denominations.json, inserts into DB
│   ├── alembic.ini
│   ├── pyproject.toml               # uv-managed project file
│   └── .env                         # GEMINI_API_KEY, DATABASE_URL (never committed)
│
└── infra/
    ├── docker-compose.yml           # PostgreSQL service only
    └── .env.example                 # Documents all required env vars across all layers
```

---

## Database Schema (Phase 1)

A single table. PostgreSQL native arrays are used for `regions` to avoid a join table for a read-only catalogue.

```sql
CREATE TABLE denomination (
    id      SERIAL PRIMARY KEY,
    name    TEXT   NOT NULL,
    type    TEXT   NOT NULL,   -- 'DOC' or 'DOCG'
    regions TEXT[] NOT NULL    -- e.g. ARRAY['Veneto', 'Friuli Venezia Giulia']
);
```

SQLModel equivalent (in `backend/app/denominations/model.py`):

```python
from typing import List
from sqlmodel import Field, Column, SQLModel
from sqlalchemy import ARRAY, Text

class Denomination(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    type: str
    regions: List[str] = Field(sa_column=Column(ARRAY(Text), nullable=False))

class DenominationRead(SQLModel):
    id: int
    name: str
    type: str
    regions: List[str]
```

---

## FastAPI Endpoints

### `GET /denominations`
Returns the full denomination catalogue. Called once by the frontend on game setup.

**Response:** `List[DenominationRead]`

### `POST /hint`
Proxies to Gemini. Identical contract to the current Next.js `/api/hint` route.

**Request body:**
```json
{
  "denominationName": "string",
  "denominationType": "string",
  "wrongRegion": "string",
  "correctRegions": ["string"],
  "remainingRegions": ["string"],
  "attemptNumber": 0,
  "language": "en"
}
```
**Response:** `{ "hint": "string" }`

### `POST /memorize`
**Request body:**
```json
{
  "denominationName": "string",
  "denominationType": "string",
  "correctRegions": ["string"],
  "language": "en"
}
```
**Response:** `{ "tip": "string" }`

### `POST /review`
**Request body:**
```json
{
  "history": [
    {
      "name": "string",
      "type": "string",
      "correctRegions": ["string"],
      "wrongAttempts": 0,
      "result": "correct"
    }
  ],
  "language": "en"
}
```
**Response:** `{ "review": "string" }`

---

## Environment Variables

### `backend/.env` (never committed)
```
GEMINI_API_KEY=your_key_here
DATABASE_URL=postgresql://sommelier:sommelier@localhost:5432/sommelier_db
```

### `frontend/.env.local` (never committed)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### `infra/.env.example` (committed — documents all vars)
```
# Backend
GEMINI_API_KEY=
DATABASE_URL=postgresql://sommelier:sommelier@localhost:5432/sommelier_db

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000

# PostgreSQL (used by docker-compose)
POSTGRES_USER=sommelier
POSTGRES_PASSWORD=sommelier
POSTGRES_DB=sommelier_db
```

---

## docker-compose (PostgreSQL only)

`infra/docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: sommelier
      POSTGRES_PASSWORD: sommelier
      POSTGRES_DB: sommelier_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

## Alembic Setup

Alembic is configured to import the SQLModel metadata so it can auto-generate migrations from model changes.

Key line in `alembic/env.py`:
```python
from app.denominations.model import Denomination  # noqa: F401 — registers table with metadata
from sqlmodel import SQLModel
target_metadata = SQLModel.metadata
```

Workflow for future schema changes:
```bash
# After modifying a model, generate a migration:
uv run alembic revision --autogenerate -m "describe the change"

# Apply all pending migrations:
uv run alembic upgrade head

# Roll back one migration:
uv run alembic downgrade -1
```

---

## Ingestion Script

`backend/scripts/ingest_denominations.py` reads the original `denominations.json` and bulk-inserts into PostgreSQL. It is idempotent (clears the table before inserting) so it can be re-run safely.

```python
# Usage: uv run python scripts/ingest_denominations.py <path-to-denominations.json>
# Clears existing rows and re-inserts from the JSON file.
```

---

## Frontend Changes

The only changes to the frontend are:

1. **Remove** `src/app/api/` entirely (hint, memorize, review Next.js routes deleted).
2. **Update** `src/lib/api.ts` — prefix all `fetch('/api/...')` calls with `process.env.NEXT_PUBLIC_API_URL`.
3. **Add** a `GET /denominations` call (in the game setup screen) to load denominations from FastAPI instead of importing the JSON file.
4. **Remove** the static `src/data/denominations.json` import from game logic (the JSON file can be kept as a data source reference but is no longer imported by the app).

No component, game logic, i18n, or styling changes required.

---

## Dev Startup Sequence

```bash
# 1. Start PostgreSQL
docker-compose -f infra/docker-compose.yml up -d

# 2. Set up and start backend (from /backend)
uv sync
cp .env.example .env          # then fill in GEMINI_API_KEY
uv run alembic upgrade head
uv run python scripts/ingest_denominations.py ../frontend/src/data/denominations.json
uv run fastapi dev app/main.py   # http://localhost:8000

# 3. Start frontend (from /frontend)
cp .env.local.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                        # http://localhost:3000
```

---

## Implementation Order

Work in this sequence to keep the app functional at each step:

1. **Repo restructure** — move current Next.js files into `/frontend`, create `/backend` and `/infra` skeletons. Verify `npm run dev` still works from `/frontend`.
2. **Infra** — write `docker-compose.yml`, start PostgreSQL, confirm connection.
3. **Backend bootstrap** — init uv project, install deps, write `database.py` and `main.py` with a health-check endpoint (`GET /health`).
4. **Denomination model + migration** — write `denominations/model.py`, run `alembic revision --autogenerate`, apply migration.
5. **Ingestion script** — write and run `scripts/ingest_denominations.py`, verify rows in DB.
6. **Denomination endpoint** — write `GET /denominations`, verify it returns data.
7. **AI endpoints** — port `gemini.ts` → `ai/gemini.py`, write the three FastAPI routes, verify against the existing request/response contracts.
8. **CORS** — configure FastAPI CORS middleware for `localhost:3000`.
9. **Frontend wiring** — update `api.ts` to use `NEXT_PUBLIC_API_URL`, replace JSON import with `GET /denominations` fetch, delete Next.js API routes.
10. **End-to-end smoke test** — play a full game session, verify hints, auto-place modal, and recap AI review all work.
11. **Build verification** — `npm run build` from `/frontend` must pass clean.

---

## Out of Scope for This Branch

The following are explicitly deferred and must not be added during this refactor:

- Authentication (email/password login, sessions, JWT)
- User profile / personal page
- New game types
- Full Docker containerisation of frontend and backend
- Any new API endpoints beyond the four listed above
