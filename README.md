# Sommelier Game

> An interactive learning tool for sommelier students to master Italian wine geography through drag-and-drop.

Place **DOC** and **DOCG** wine denomination cards onto the correct regions of an SVG map of Italy. Get AI-powered hints when you're wrong, earn points for precision, review your session with a full AI recap, and track your progress over time in the personal area.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│            Next.js 16 — localhost (via nginx)           │
│   Login · Register · Setup · Game · Recap screens       │
│   proxy.ts — JWT cookie auth guard on all routes        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP /api/* (same origin)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  nginx reverse proxy                     │
│                                                         │
│  /        → frontend:3000 (Next.js)                     │
│  /api/    → backend:8000  (FastAPI, prefix stripped)    │
└──────────┬──────────────────────┬───────────────────────┘
           │                      │
           ▼                      ▼
┌──────────────────┐  ┌──────────────────────────────────┐
│  Next.js 16      │  │         FastAPI backend           │
│  (standalone)    │  │                                   │
│                  │  │  POST /auth/register              │
│  proxy.ts        │  │  POST /auth/login                 │
│  verifies JWT    │  │  POST /auth/logout                │
│  from cookie     │  │  GET  /auth/me                    │
│  server-side     │  │  GET  /auth/google                │
│                  │  │  GET  /auth/google/callback       │
└──────────────────┘  │                                   │
                      │  GET  /denominations              │
                      │  POST /hint                       │
                      │  POST /memorize                   │
                      │  POST /review                     │
                      │  POST /session                    │
                      │  GET  /session/stats              │
                      │  GET  /health                     │
                      │           │              │        │
                      │    Google Gemini    PostgreSQL     │
                      │  gemini-3.1-flash-lite    │
                      └───────────────────┬───────────────┘
                                          │
              ┌───────────────────────────▼───────────────┐
              │               PostgreSQL 16               │
              │                                           │
              │  denomination(id, name, type, regions)    │
              │  users(id, email, first_name, last_name,  │
              │        hashed_password, google_id, ...)   │
              │  game_sessions(id, user_id, game_id, ...) │
              │  session_card_attempts(id, session_id,...)│
              └───────────────────────────────────────────┘
```

### Repo layout

```
sommelier_game/
├── frontend/      # Next.js app
├── backend/       # FastAPI + SQLModel + Alembic
│   └── data/      # denominations.json (ingestion source)
├── infra/         # docker-compose, nginx config, .env
├── docs/adr/      # Architecture Decision Records
└── start.sh       # single-command startup (hot-reload dev)
```

---

## Getting started

### Prerequisites

- Docker Desktop
- Node.js 20+ *(hot-reload dev only)*
- Python 3.12+ with [uv](https://docs.astral.sh/uv/) *(hot-reload dev only)*
- A Gemini API key

---

### Option A — Docker (recommended)

All services run in containers behind nginx. The stack is production-equivalent.

```bash
# 1. Create the environment file
cp infra/.env.example infra/.env
#    Edit infra/.env and set at minimum:
#      JWT_SECRET     — run: openssl rand -hex 32
#      GEMINI_API_KEY — your Google AI Studio key

# 2. Build and start
docker compose -f infra/docker-compose.yml up --build
```

The app is available at **http://localhost**.

On subsequent runs `--build` can be omitted unless source files changed.

> **Google OAuth with Docker:** set `GOOGLE_REDIRECT_URI=http://localhost/api/auth/google/callback` in `infra/.env` and register the same URI in Google Cloud Console.

---

### Option B — Hot-reload dev (`start.sh`)

Runs Next.js and FastAPI natively for fast iteration. Requires Node.js, Python, and uv installed locally.

```bash
# 1. Configure backend
cp backend/.env.example backend/.env
#    Set GEMINI_API_KEY, JWT_SECRET, and GOOGLE_* (see file for instructions)

# 2. Configure frontend
cp frontend/.env.local.example frontend/.env.local
#    Set JWT_SECRET to the same value as backend/.env

# 3. Start everything
./start.sh
```

`start.sh` starts PostgreSQL (Docker), runs Alembic migrations, ingests the denomination catalogue, then starts both servers. Frontend on `localhost:3000`, backend on `localhost:8000`.

On subsequent runs `./start.sh` is all you need — migrations and ingestion are idempotent.

---

### Google OAuth setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → OAuth consent screen (External, add `email` + `profile` scopes)
3. Credentials → OAuth client ID (Web application), add authorized redirect URIs:
   - Docker: `http://localhost/api/auth/google/callback`
   - `start.sh` dev: `http://localhost:8000/auth/google/callback`
4. Copy Client ID and Secret into your `.env` file

Google OAuth is optional — email/password registration works without it.

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
# Start / stop PostgreSQL only
docker compose -f infra/docker-compose.yml up -d db
docker compose -f infra/docker-compose.yml stop

# Migrations (after changing a model)
cd backend
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head

# Re-ingest denomination catalogue
uv run python scripts/ingest_denominations.py data/denominations.json
```

### E2E tests (Playwright)

**Prerequisite: full stack must be running** (`./start.sh` or `docker compose up`, servers on `:3000` and `:8000` respectively).

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
       │
       ▼ (all cards done)
  Recap — AI review + stats → session saved to DB
       │
       ▼
  Profile — history, avg score, region & type performance
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
| Reverse proxy | nginx (Docker) |
| Frontend | Next.js 16 (App Router, standalone output) + TypeScript + Tailwind CSS |
| Auth (frontend) | `jose` (JWT verification in proxy), `AuthContext` React context |
| Drag & Drop | dnd-kit with custom SVG collision detection |
| Map | `@svg-maps/italy` (20 regions) |
| i18n | next-intl — EN / IT |
| Backend | FastAPI + Python 3.12, managed with uv |
| Auth (backend) | `python-jose` (JWT), `passlib[bcrypt]` (passwords), `authlib` (Google OAuth) |
| ORM / schema | SQLModel + Alembic |
| Database | PostgreSQL 16 |
| AI | Google Gemini `gemini-3.1-flash-lite` |
| Frontend tests | Vitest (unit) + Playwright (E2E) |
| Backend tests | pytest + httpx |

---

## Data model

**Denomination catalogue** — 410 entries covering all Italian DOC and DOCG appellations, stored in `backend/data/denominations.json` and ingested into PostgreSQL at startup:
```json
{ "name": "Prosecco", "type": "DOC", "regions": ["Veneto", "Friuli Venezia Giulia"] }
```
`regions` is always an array — many denominations span multiple regions.

**Session history** — every completed game is persisted:
- `game_sessions` records the filter used, final score, max score, and duration.
- `session_card_attempts` records each denomination played: wrong attempts, result (`correct` / `auto-placed`), and which regions were found vs auto-placed (stored as SVG IDs).

The profile page aggregates this data to show avg/best score, unique denominations discovered, per-type performance (DOC vs DOCG), and top/bottom regions.
