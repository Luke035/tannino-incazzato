@AGENTS.md

# Sommelier Game

A web app for sommelier students to learn the regional collocations of Italian DOC/DOCG wine denominations via drag-and-drop on an SVG map of Italy.

## Running the project

```bash
# First run — fill in GEMINI_API_KEY in backend/.env first
./start.sh        # starts PostgreSQL, runs migrations, ingests data, starts both servers

# Frontend only (from /frontend)
npm run dev       # http://localhost:3000
npm run build     # production build (run this to verify before committing)
npm run test      # run frontend test suite once
npm run test:watch  # TDD watch mode

# Backend only (from /backend)
uv run fastapi dev app/main.py   # http://localhost:8000
uv run pytest                    # run backend test suite
```

## Architecture

3-layer monorepo: `/frontend` (Next.js) → `/backend` (FastAPI) → PostgreSQL (Docker via `/infra`).

The browser calls FastAPI directly using `NEXT_PUBLIC_API_URL`. There are no Next.js API routes.

## Tech stack

### Frontend (`/frontend`)
- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **dnd-kit** for drag-and-drop (`@dnd-kit/core`, `@dnd-kit/utilities`)
- **@svg-maps/italy** for the SVG map (20 regions, English kebab-case IDs)
- **next-intl** for i18n (EN/IT, locale-based routing under `src/app/[locale]/`)
- **Vitest** for testing (pure lib functions)

### Backend (`/backend`)
- **FastAPI** + Python 3.12, managed with **uv**
- **SQLModel** (ORM) + **Alembic** (migrations)
- **google-genai** — Gemini model `gemini-3.1-flash-lite-preview`
- **pytest** + **httpx** for testing (SQLite in-memory for DB isolation)

### Infra (`/infra`)
- **PostgreSQL 16** via Docker Compose

## Key conventions

### Data model
Denominations are stored in PostgreSQL (`denomination` table) and served by `GET /denominations`.
The source file `frontend/src/data/denominations.json` (410 entries) is the ingestion source only — it is not imported by the app at runtime.

```json
{ "name": "Prosecco", "type": "DOC", "regions": ["Veneto", "Friuli Venezia Giulia"] }
```
`regions` is **always an array** — denominations can span multiple regions.

### Region naming
Two separate namespaces — always use the mapping functions, never hardcode:
- **JSON region names** (used in `denominations.json`, `foundRegions`, and `placedCards` keys): `"Emilia Romagna"`, `"Valle D'aosta"`, `"Puglia"` …
- **SVG IDs** (used by `@svg-maps/italy` and dnd-kit droppable IDs): `"emilia-romagna"`, `"aosta-valley"`, `"apulia"` …
- Conversion: `regionToSvgId(jsonName)` and `svgIdToDisplay(svgId)` in `frontend/src/lib/regionMapping.ts`

**Correctness checking always happens in SVG ID space.** In `handleDragEnd`, convert `denomination.regions` via `regionToSvgId` and compare against the dropped SVG ID directly — never convert the SVG ID to a display name and compare against JSON names. The two string systems are not round-trip-safe (e.g. `"Emilia Romagna"` → `"emilia-romagna"` → `"Emilia-Romagna"` ≠ original). `svgIdToDisplay` is used only for rendering labels.

### Multi-regional game flow
A card stays active until the student places it in **all** correct regions. A shared wrong-attempt counter (max 3) applies across all placements for the card. After 3 wrong drops an `AutoPlaceModal` is shown with the correct answer and an AI memory tip before the game advances.

### Scoring (per card)
| Wrong attempts | Points |
|---|---|
| 0 | 3 |
| 1 | 2 |
| 2 | 1 |
| 3 (auto-placed) | 0 |

### SVG drag-and-drop precision
The default dnd-kit bounding-box collision detection is replaced with a custom `svgCollisionDetection` (`frontend/src/lib/svgCollision.ts`) that uses `document.elementFromPoint` for pixel-perfect hit-testing on SVG paths. The post-it uses `pointerEvents: none` while dragging so the cursor reaches the SVG beneath it.

### AI endpoints
All three Gemini endpoints live in the FastAPI backend (`backend/app/ai/`):
- `POST /hint` — hint after a wrong drop (during game)
- `POST /memorize` — memory tip shown in the auto-place modal
- `POST /review` — full session review shown on the recap screen

All prompts pass a `language` field (`"en"` or `"it"`) so Gemini responds in the correct language.

**Never call these endpoints directly from components.** Use the typed wrappers in `frontend/src/lib/api.ts` (`fetchHint`, `fetchMemorizeTip`, `fetchReview`, `fetchDenominations`). The prompt logic lives in `backend/app/ai/gemini.py`.

### i18n
- Translation files: `frontend/src/messages/en.json`, `frontend/src/messages/it.json`
- Language toggle in the global `Header` component; persists via locale routing
- Denomination names are **always in Italian** regardless of UI language

### Environment variables
- `backend/.env` — `GEMINI_API_KEY`, `DATABASE_URL` (never committed; copy from `.env.example`)
- `frontend/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:8000` (never committed; copy from `.env.local.example`)

## Project structure

```
sommelier_game/
├── frontend/
│   └── src/
│       ├── app/[locale]/      # Setup, game, and recap screens
│       ├── components/
│       │   ├── game/          # PostIt, ScoreCounter, AutoPlaceModal
│       │   ├── map/           # ItalyMap, RegionPanel
│       │   └── recap/         # RecapStats, AIReview
│       ├── data/denominations.json   # ingestion source only — not imported by app
│       ├── i18n/              # next-intl routing, request config, navigation
│       ├── lib/
│       │   ├── api.ts         # typed client wrappers for all API endpoints
│       │   ├── gameLogic.ts   # scoring, shuffling, recap stats
│       │   ├── regionMapping.ts  # JSON name <-> SVG ID conversion
│       │   ├── svgCollision.ts   # custom dnd-kit collision detection
│       │   └── __tests__/     # Vitest unit tests
│       ├── messages/          # en.json, it.json
│       ├── middleware.ts      # next-intl locale routing
│       └── types/index.ts     # Denomination, CardAttempt, SessionState, Filter …
│
├── backend/
│   ├── app/
│   │   ├── ai/
│   │   │   ├── gemini.py      # Gemini prompt functions
│   │   │   └── router.py      # POST /hint, /memorize, /review
│   │   ├── denominations/
│   │   │   ├── model.py       # SQLModel table + Pydantic response schema
│   │   │   └── router.py      # GET /denominations
│   │   ├── database.py        # SQLModel engine + get_session dependency
│   │   └── main.py            # FastAPI app, CORS, router registration
│   ├── alembic/               # migration scripts
│   ├── scripts/
│   │   └── ingest_denominations.py
│   └── tests/                 # pytest suite
│
├── infra/
│   └── docker-compose.yml     # PostgreSQL 16
│
└── start.sh                   # unified startup script
```
