# Sommelier Game

> An interactive learning tool for sommelier students to master Italian wine geography through drag-and-drop.

Place **DOC** and **DOCG** wine denomination cards onto the correct regions of an SVG map of Italy. Get AI-powered hints when you're wrong, earn points for precision, and review your session with a full AI recap.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│            Next.js 16 — localhost:3000                  │
│   Login · Register · Setup · Game · Recap screens       │
│   proxy.ts — JWT cookie auth guard on all routes        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP (NEXT_PUBLIC_API_URL)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   FastAPI backend                        │
│                    localhost:8000                        │
│                                                         │
│  POST /auth/register   — create account + set cookie    │
│  POST /auth/login      — verify credentials + set cookie│
│  POST /auth/logout     — clear cookie                   │
│  GET  /auth/me         — return current user            │
│  GET  /auth/google     — start Google OAuth flow        │
│  GET  /auth/google/callback — finish OAuth, set cookie  │
│                                                         │
│  GET  /denominations   — serve wine catalogue           │
│  POST /hint            — AI hint after wrong drop       │
│  POST /memorize        — AI tip in auto-place modal     │
│  POST /review          — AI recap at session end        │
│  GET  /health                                           │
│                  │                  │                   │
│           Google Gemini      PostgreSQL (SQLModel)      │
│      gemini-3.1-flash-lite-preview                      │
└──────────────────────────────┬──────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────┐
│                   PostgreSQL 16                          │
│               Docker — localhost:5432                    │
│                                                         │
│   denomination(id, name, type, regions)                 │
│   users(id, email, first_name, last_name,               │
│         hashed_password, google_id, created_at)         │
└─────────────────────────────────────────────────────────┘
```

### Repo layout

```
sommelier_game/
├── frontend/      # Next.js app
├── backend/       # FastAPI + SQLModel + Alembic
├── infra/         # docker-compose (PostgreSQL)
└── start.sh       # single-command startup
```

---

## Getting started

### Prerequisites

- Docker Desktop (for PostgreSQL)
- Node.js 20+
- Python 3.12+ with [uv](https://docs.astral.sh/uv/)
- A Gemini API key

### First run

```bash
# 1. Configure backend environment
cp backend/.env.example backend/.env
#    Edit backend/.env and set:
#      GEMINI_API_KEY   — your Google AI Studio key
#      JWT_SECRET       — run: openssl rand -hex 32
#      GOOGLE_*         — see Google OAuth setup below

# 2. Configure frontend environment
cp frontend/.env.local.example frontend/.env.local
#    Set JWT_SECRET to the same value as backend/.env

# 3. Start everything
./start.sh
```

`start.sh` handles the rest: starts PostgreSQL, runs Alembic migrations, ingests the denomination catalogue, then starts both servers. Frontend on `localhost:3000`, backend on `localhost:8000`.

On subsequent runs `./start.sh` is all you need — migrations and ingestion are idempotent.

### Google OAuth setup

See the step-by-step instructions in `backend/.env.example`. Summary:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → OAuth consent screen (External, add `email` + `profile` scopes)
3. Credentials → OAuth client ID (Web application)
   - Authorized redirect URI: `http://localhost:8000/auth/google/callback`
4. Copy Client ID and Secret into `backend/.env`

Google OAuth is optional for local development — email/password registration works without it.

---

## Development

### Frontend (Next.js)

```bash
cd frontend
npm run dev        # http://localhost:3000
npm run build      # production build — run before committing
npm run test       # Vitest unit tests
npm run test:watch # TDD watch mode
```

### Backend (FastAPI)

```bash
cd backend
uv run fastapi dev app/main.py   # http://localhost:8000
uv run pytest                    # test suite
```

### Database

```bash
# Start / stop PostgreSQL
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml stop

# Migrations (after changing a model)
cd backend
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head

# Re-ingest denomination catalogue
uv run python scripts/ingest_denominations.py ../frontend/src/data/denominations.json
```

### E2E tests (Playwright)

**Prerequisite: full stack must be running** (`./start.sh` or servers started manually on `:3000` and `:8000`).

```bash
# From /frontend
npx playwright install --with-deps chromium   # first time only
npm run test:e2e                               # run all E2E tests headlessly
npm run test:e2e -- --headed                  # watch with browser visible
npm run test:e2e -- e2e/auth.spec.ts          # single file
```

The E2E global setup creates a test user and saves the session cookie to `playwright/.auth/user.json` (gitignored). Google OAuth is not covered by E2E tests — test manually.

---

## How the game works

```
  Login / Register
       │
       ▼
  Start (choose DOC / DOCG / both)
       │
       ▼
┌─────────┐   correct drop    ┌─────────────────┐
│  Card   │ ─────────────────►│  Next card / +3 │
│ active  │                   └─────────────────┘
│         │   wrong drop
│         │ ─────────────────► AI hint shown, -1 point potential
│         │
│         │   3rd wrong drop
└─────────┘ ─────────────────► AutoPlace modal + AI memory tip → next card
```

### Scoring

| Wrong attempts  | Points |
|:---------------:|:------:|
| 0               | 3      |
| 1               | 2      |
| 2               | 1      |
| 3 (auto-placed) | 0      |

Multi-region denominations (e.g. Prosecco spans Veneto + Friuli Venezia Giulia) must be placed in **all** correct regions. A single wrong-attempt counter tracks the whole card.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind CSS |
| Auth (frontend) | `jose` (JWT verification in proxy), `AuthContext` React context |
| Drag & Drop | dnd-kit with custom SVG collision detection |
| Map | `@svg-maps/italy` (20 regions) |
| i18n | next-intl — EN / IT |
| Backend | FastAPI + Python 3.12 |
| Auth (backend) | `python-jose` (JWT), `passlib[bcrypt]` (passwords), `authlib` (Google OAuth) |
| ORM / schema | SQLModel + Alembic |
| Database | PostgreSQL 16 (Docker) |
| AI | Google Gemini `gemini-3.1-flash-lite-preview` |
| Frontend tests | Vitest (unit) + Playwright (E2E) |
| Backend tests | pytest + httpx |

---

## Data model

```json
{ "name": "Prosecco", "type": "DOC", "regions": ["Veneto", "Friuli Venezia Giulia"] }
```

410 entries covering all Italian DOC and DOCG appellations. `regions` is always an array — many denominations span multiple regions.
