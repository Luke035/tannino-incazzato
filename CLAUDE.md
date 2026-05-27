@AGENTS.md

# Sommelier Game

A web app for sommelier students to learn the regional collocations of Italian DOC/DOCG wine denominations via drag-and-drop on an SVG map of Italy.

## Running the project

```bash
# First run — fill in backend/.env and frontend/.env.local first (see below)
./start.sh        # starts PostgreSQL, runs migrations, ingests data, starts both servers

# Frontend only (from /frontend)
npm run dev       # http://localhost:3000
npm run build     # production build (run this to verify before committing)
npm run test      # run frontend unit test suite once
npm run test:watch  # TDD watch mode

# Backend only (from /backend)
uv run fastapi dev app/main.py   # http://localhost:8000
uv run pytest                    # run backend test suite
```

### E2E tests (Playwright)

**Prerequisite: full stack must be running** (`./start.sh` or servers started manually on `:3000` and `:8000`).

```bash
# From /frontend
npx playwright install --with-deps chromium   # first time only
npm run test:e2e                               # run all E2E tests headlessly
npm run test:e2e -- --headed                  # watch with browser visible
npm run test:e2e -- e2e/happy-path.spec.ts    # single file
```

**Run `npm run test:e2e` after any change to:** UI components, game flow logic, API routes, auth flow, or i18n strings. Do not skip this step before committing.

The E2E global setup (`e2e/global-setup.ts`) creates a test user via the real API and saves the session cookie to `playwright/.auth/user.json` (gitignored). All game tests run with that session pre-loaded. Auth tests use `storageState: { cookies: [], origins: [] }` to start without a session.

## Architecture

3-layer monorepo: `/frontend` (Next.js) → `/backend` (FastAPI) → PostgreSQL (Docker via `/infra`).

The browser calls FastAPI directly using `NEXT_PUBLIC_API_URL`. There are no Next.js API routes.

## Tech stack

### Frontend (`/frontend`)
- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **dnd-kit** for drag-and-drop (`@dnd-kit/core`, `@dnd-kit/utilities`)
- **@svg-maps/italy** for the SVG map (20 regions, English kebab-case IDs)
- **next-intl** for i18n (EN/IT, locale-based routing under `src/app/[locale]/`)
- **jose** for JWT verification inside `proxy.ts` (Next.js 16 edge-compatible)
- **Vitest** for unit tests; **Playwright** for E2E tests

### Backend (`/backend`)
- **FastAPI** + Python 3.12, managed with **uv**
- **SQLModel** (ORM) + **Alembic** (migrations)
- **python-jose[cryptography]** — JWT signing/verification
- **passlib[bcrypt]** — password hashing (bcrypt pinned to `<5.0` for passlib compatibility)
- **authlib** + **httpx** — Google OAuth2 backend flow
- **google-genai** — Gemini model `gemini-3.1-flash-lite`
- **pytest** + **httpx** for testing (SQLite in-memory for DB isolation)

### Infra (`/infra`)
- **PostgreSQL 16** via Docker Compose

## Key conventions

### Authentication
Auth uses **JWT stored in an HttpOnly cookie** (`sommelier_session`, 7-day expiry). The cookie is set by the FastAPI backend on login/register and verified server-side by `proxy.ts`.

- **`proxy.ts`** (Next.js 16 replacement for `middleware.ts`) — protects all routes except `/login` and `/register`. Unauthenticated visits to any other path redirect to `/login?next=<path>`. Authenticated visits to `/login` or `/register` redirect to `/`.
- **`AuthContext`** (`src/context/AuthContext.tsx`) — calls `GET /auth/me` at mount, exposes `user`, `logout()`, and `setUser()` to all components. Wrap with `AuthProvider` in layout.
- **Auth API wrappers** live in `src/lib/auth.ts` — `fetchMe`, `apiLogin`, `apiRegister`, `apiLogout`. Always pass `credentials: 'include'` for cookie forwarding.
- **Google OAuth** is backend-initiated: the "Continua con Google" button is a plain `<a href="/auth/google">` that triggers the FastAPI redirect flow. After callback the backend sets the cookie and redirects to `FRONTEND_URL/en`.

### Data model
Denominations are stored in PostgreSQL (`denomination` table) and served by `GET /denominations`.
The source file `frontend/src/data/denominations.json` (410 entries) is the ingestion source only — it is not imported by the app at runtime.

```json
{ "name": "Prosecco", "type": "DOC", "regions": ["Veneto", "Friuli Venezia Giulia"] }
```
`regions` is **always an array** — denominations can span multiple regions.

### Session persistence
When a game ends, the recap page saves the session to the backend before displaying results.

**Frontend flow:**
1. `game/page.tsx` stores `Date.now()` in `sessionStorage('game_started_at')` when denominations are loaded and adds `filter` to the recap URL params.
2. `recap/page.tsx` calls `fetchSaveSession` on mount (guarded by a `useRef` flag to prevent React StrictMode double-invocation). Reads `filter` from URL params and `started_at` from sessionStorage. Clears sessionStorage after saving.
3. `profile/page.tsx` calls `fetchSessionStats` to load aggregated stats.

**Backend endpoints** (both require `sommelier_session` cookie):
- `POST /session` — receives `{ gameId, filter, startedAt, history[] }`, computes `score`, `max_score`, `duration_seconds`, persists to `game_sessions` + `session_card_attempts`.
- `GET /session/stats` — returns last-5 session summaries, aggregate stats (total, avg %, best %, unique denominations), type performance (DOC/DOCG %), and top/bottom-4 regions. All aggregations done in Python (works with SQLite in tests).

**DB tables:**
- `game_sessions(id, user_id FK, game_id, filter, score, max_score, duration_seconds, played_at)`
- `session_card_attempts(id, session_id FK, denomination_name, denomination_type, wrong_attempts, result, found_regions JSON, auto_placed_regions JSON)`

Regions in `found_regions` / `auto_placed_regions` are stored as **SVG IDs** (same space used by the game logic). The profile page converts them to display names via `svgIdToDisplay()`.

**Formulas:**
- Session score %: `score / max_score * 100`
- Region performance: `correct_placements / (correct + auto_placed) * 100`
- Type performance: average of `score_for_card / 3 * 100` per card, grouped by `denomination_type`
- "Denominazioni scoperte": `COUNT DISTINCT denomination_name` across all user sessions

**Never call `/session` or `/session/stats` directly from components.** Use `fetchSaveSession` and `fetchSessionStats` in `frontend/src/lib/api.ts`.

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

**Never call these endpoints directly from components.** Use the typed wrappers in `frontend/src/lib/api.ts` (`fetchHint`, `fetchMemorizeTip`, `fetchReview`, `fetchDenominations`, `fetchSaveSession`, `fetchSessionStats`). The prompt logic lives in `backend/app/ai/gemini.py`.

### i18n
- Translation files: `frontend/src/messages/en.json`, `frontend/src/messages/it.json`
- Language toggle in the global `Header` component; persists via locale routing
- Denomination names are **always in Italian** regardless of UI language

### Environment variables
**`backend/.env`** (never committed; copy from `.env.example`):
- `GEMINI_API_KEY` — Google AI Studio key
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — random secret for signing JWTs (`openssl rand -hex 32`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — Google OAuth credentials (see `.env.example` for setup steps)
- `FRONTEND_URL` — where the backend redirects after Google OAuth callback (default: `http://localhost:3000`)

**`frontend/.env.local`** (never committed; copy from `.env.local.example`):
- `NEXT_PUBLIC_API_URL` — FastAPI base URL (default: `http://localhost:8000`)
- `JWT_SECRET` — must match `backend/.env` exactly (used by `proxy.ts` to verify cookies server-side)

## Project structure

```
sommelier_game/
├── frontend/
│   └── src/
│       ├── app/[locale]/      # Login, register, setup, game, recap, profile screens
│       ├── components/
│       │   ├── game/          # PostIt, ScoreCounter, AutoPlaceModal
│       │   ├── map/           # ItalyMap, RegionPanel
│       │   └── recap/         # RecapStats, AIReview
│       ├── context/
│       │   └── AuthContext.tsx   # AuthProvider + useAuth() hook
│       ├── data/denominations.json   # ingestion source only — not imported by app
│       ├── i18n/              # next-intl routing, request config, navigation
│       ├── lib/
│       │   ├── api.ts         # typed client wrappers for game API endpoints
│       │   ├── auth.ts        # typed client wrappers for auth endpoints
│       │   ├── gameLogic.ts   # scoring, shuffling, recap stats
│       │   ├── regionMapping.ts  # JSON name <-> SVG ID conversion
│       │   ├── svgCollision.ts   # custom dnd-kit collision detection
│       │   └── __tests__/     # Vitest unit tests
│       ├── messages/          # en.json, it.json
│       ├── proxy.ts           # Next.js 16 route guard (JWT verification + i18n)
│       └── types/index.ts     # Denomination, CardAttempt, SessionState, Filter …
│
├── backend/
│   ├── app/
│   │   ├── ai/
│   │   │   ├── gemini.py      # Gemini prompt functions
│   │   │   └── router.py      # POST /hint, /memorize, /review
│   │   ├── auth/
│   │   │   ├── jwt.py         # create/verify JWT, set/clear HttpOnly cookie
│   │   │   └── router.py      # POST /auth/register|login|logout, GET /auth/me|google|google/callback
│   │   ├── denominations/
│   │   │   ├── model.py       # SQLModel table + Pydantic response schema
│   │   │   └── router.py      # GET /denominations
│   │   ├── sessions/
│   │   │   ├── model.py       # GameSession + SessionCardAttempt SQLModel tables
│   │   │   └── router.py      # POST /session, GET /session/stats
│   │   ├── users/
│   │   │   └── model.py       # User SQLModel table + UserRead schema
│   │   ├── database.py        # SQLModel engine + get_session dependency
│   │   └── main.py            # FastAPI app, CORS (allow_credentials=True), router registration
│   ├── alembic/               # migration scripts
│   ├── scripts/
│   │   └── ingest_denominations.py
│   └── tests/                 # pytest suite (test_auth.py, test_denominations.py, test_sessions.py …)
│
├── infra/
│   └── docker-compose.yml     # PostgreSQL 16
│
└── start.sh                   # unified startup script
```
