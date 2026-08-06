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

### Mandatory QA gate — launch the `qa-sommelier` agent

**After ANY change that touches the frontend, backend, game flow, auth, i18n, or API routes, you MUST launch the `qa-sommelier` subagent as the quality gate before reporting the work as done or committing.** This is not optional and not satisfied by running tests yourself: the `qa-sommelier` agent owns the full gate (boots the stack, runs pytest + Vitest + production build + Playwright E2E) and returns a verdict it produced itself.

- Launch it via the Agent tool with `subagent_type: qa-sommelier` once implementation is complete and the working tree is in the state to be verified.
- This applies to changes made directly or by spawned implementation teammates — the QA gate runs on the integrated result.
- Only skip if the change is purely non-code (docs, comments, CONTEXT.md/ADRs) with zero impact on the running app. When skipping, say so explicitly and why.
- If the agent reports failures, fix them (or surface them) before declaring done — do not present a green result you did not get from the gate.

The E2E global setup (`e2e/global-setup.ts`) creates a test user via the real API and saves the session cookie to `playwright/.auth/user.json` (gitignored). All game tests run with that session pre-loaded. Auth tests use `storageState: { cookies: [], origins: [] }` to start without a session.

## Session handoffs (Obsidian vault)

Development sessions are bookended by handoff notes in the user's **local** Obsidian vault at
`/Users/lucagrazioli/Documents/claude-vault/claude-vault/` (the real vault root — the nested folder
containing `.obsidian/`; outside the repo, paths machine-specific — solo local workflow). Notes live
at `tannino-incazzato/<section>/YYYYMMDD_<slug>.md`, following `tannino-incazzato/_TEMPLATE_handoff.md`.

**At session start:** read the most recent handoff(s) for the area you're about to work on, to pick
up open threads and avoid repeating dead-ends.

**Writing the end-of-session handoff is USER-TRIGGERED** — the user gives the dump signal; do not
auto-run it (same posture as the QA gate). But **proactively remind the user** to dump the handoff
when a chunk of work is wrapping up or before ending the session, exactly like you remind about the
`qa-sommelier` gate. When triggered, the note MUST record — **per problem — the symptom, the attempts
made (including dead-ends and why they failed), the root cause, and the resolution**, not just the
final fix; that trail is the whole point.

### obsidian-cli cheat-sheet (don't re-discover it each session)
- Binary: `/opt/homebrew/bin/obsidian-cli` (v0.2.3, Yakitrak). **Not on the non-interactive shell
  PATH — always call by full path.** Default vault is already set to the path above.
- Read / navigate: `obsidian-cli list <folder>` · `obsidian-cli print <note>` ·
  `obsidian-cli frontmatter <note> --print` · `obsidian-cli search-content <term>` ·
  `obsidian-cli open <note>`. Note names are vault-relative; no `.md` extension needed.
- **Write notes by hand, NOT via the CLI:** `create` does not create intermediate folders, and its
  `--content` flag mangles rich markdown (backticks, `$`, apostrophes) through the shell. So `mkdir -p`
  the section folder, then write the `.md` with the Write tool.

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
- **google-genai** — Gemini model `gemini-3.1-flash-lite` (hints, memory tips, session reviews)
- **pydantic-ai-slim[google]** — typed agent grading the Exam's Open Questions (ADR 0010)
- **pytest** + **httpx** for testing (SQLite in-memory for DB isolation)

### Infra (`/infra`)
- **PostgreSQL 17** via Docker Compose

## Key conventions

### Language: chat in any language, publish in English
The conversation *might* be in Italian, or it might be in English — follow whatever language the user
opens in. **Regardless of the conversation language, everything that gets published —
i.e. anything another person or system reads — is written in English**, with no exceptions:
PR titles and descriptions, commit messages, issue and review comments, code comments,
identifiers, docs (README/ADRs/CLAUDE.md), log and error strings.

The only exception is **user-facing product copy**, which is localised through
`src/messages/{en,it}.json` — never hardcoded (see the design-system and i18n sections).

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

### Question Bank (Promossi o Cirrotici)
Questions live in PostgreSQL (`question` table) and are the source of truth once seeded
(ADR 0009). `backend/data/question_bank.csv` seeds them **once** via
`scripts/seed_questions.py`, which no-ops if the table already holds a row, so it runs safely on
every boot from `entrypoint.sh` and `start.sh` (ADR 0011). The check-and-load is held by a
Postgres advisory lock — concurrent boots would otherwise both find an empty table and double the
bank. Corrections are made in the database, never by re-ingesting the file. Questions are
deactivated (`active = false`), never deleted.

A question carries: `text`, `format` (`true_false` | `multiple_choice` | `open`), `level` (1/2/3),
`reference_answer`, `options`, `explanation`, `topic`, `open_subtype` (`conceptual` | `list`) and
`active`. `topic` and `open_subtype` are produced offline and committed as seed data — see
[`docs/question-bank-classification.md`](docs/question-bank-classification.md) for the taxonomy,
how the classification was produced, and how a correction is made.

### The Exam (Promossi o Cirrotici)
The Exam is drawn, served and graded entirely by the backend (ADR 0007) and lives in its own
`exam_sessions` / `exam_answers` tables (ADR 0008). `game_sessions` and `session_card_attempts`
are untouched and keep serving Mappa dei Vini alone.

`EXAM_COMPOSITION` in `backend/app/exams/model.py` draws **14 open + 11 multiple choice +
5 true/false = 30**, passed at 60% (18/30). Levels are not part of the composition: the draw is
blind across the whole active bank, so the three Levels come out in the proportion the bank
holds them.

Endpoints, all requiring the `sommelier_session` cookie and all refusing an Exam that is not the
caller's with a 404:

| Endpoint | Does |
|---|---|
| `POST /quiz/exams` | Draws the paper and persists it. 409 `question_bank_too_small` if the bank cannot fill it, 409 `exam_in_progress` if the player already has one open. |
| `GET /quiz/exams/current` | The Session in progress with its answers so far, or `null` when the slot is free. Declared **before** `/{id}` — routes match in the order they are written. |
| `GET /quiz/exams/{id}` | The paper with the answers so far — and, once submitted, the Verdicts, the score and the correct answers. |
| `POST /quiz/exams/{id}/abandon` | Frees the slot. 409 `exam_not_in_progress` on anything already submitted or abandoned. |
| `PUT /quiz/exams/{id}/answers/{question_id}` | Records or clears (`null`) one answer. Returns **no Verdict** in Exam mode. 422 past `MAX_OPEN_ANSWER_CHARS`. |
| `POST /quiz/exams/{id}/submit` | Grades the Closed Questions and returns immediately. Always possible, blanks and all. |
| `POST /quiz/exams/{id}/grade` | Grades the Open Questions through the agent. Idempotent — it only looks at what has no Verdict yet. 503 `grading_incomplete` when the paper is still short. |

Rules that are not negotiable:
- **The browser never holds the answer to a question it is still being asked.** `correct_answer`
  and `verdict` stay `null` until submission, and the bank's `explanation` is never served at
  all — it spells the answer out in prose, and it stays unused in this scope (#16). The
  `feedback` field of a served question is the *agent's* note on the player's own answer,
  never the bank's.
- **A paper has a score only when every question on it carries a Verdict.** `grading_complete`
  says whether it does. An ungraded Open Question is never counted wrong: a model that timed
  out must not fail a candidate, so the Session stays ungraded, emits no score, and is retried
  by calling `/grade` again.
- **Multiple-choice options are shuffled by the backend**, never the browser: in the source bank
  the correct answer is always the first option. The shuffled order is persisted in
  `exam_answers.served_options`, so a resumed Exam is the same paper.
- **True/false is answered in the bank's vocabulary** (`VERO` / `FALSO`); only the label is
  localized, so a paper sat in English grades exactly like one sat in Italian.
- Selection is blind and random across the whole active bank, **never filtered by Level**, and
  excludes every question of the player's immediately preceding Exam — whatever became of it, an
  abandoned paper included.
- **A player has at most one Session in progress at a time**, across every mode of the game. A
  Session leaves that slot by being submitted or by being abandoned (`status = abandoned`), never
  by another one starting: work is only ever destroyed by an explicit, confirmed choice. The rule
  is held by the **partial unique index `uq_exam_sessions_one_in_progress_per_user`**, not by the
  check that precedes the insert — two taps in two tabs both pass a check. The `IntegrityError`
  it raises is answered with the same 409 `exam_in_progress`. Only a
  **submitted** Session carries a score and a `submitted_at`, which is what keeps abandoned and
  never-finished Sessions out of statistics. In-progress Sessions do not expire.
- **Answers persist as they are given** — the `PUT` is the save — so a closed tab costs nothing
  and `GET /quiz/exams/current` is enough to put a returning player back where they were, on the
  same paper with the same served option order.
- Closed Questions are graded by exact comparison, with **no model call**. An unanswered question
  is wrong — including a blank Open Question, which is graded without asking anybody. One point
  per question — no weighting, no negative marking, no partial credit.

Use `startExam`, `fetchCurrentExam`, `fetchExam`, `saveExamAnswer`, `submitExam`, `abandonExam`
and `gradeExam` in `frontend/src/lib/api.ts`; never call these endpoints from a component.
`startExam` answers `{ started }` or `{ refused }` — the two refusals are different situations
(one offers the player a choice, the other is a dead end) and the wrapper is where they are told
apart.

### Practice mode (`backend/app/exams/practice.py`)
Practice is the same Session resource under `mode = practice`, on the same tables, sharing
`backend/app/exams/service.py` with the Exam and with Error Review — loading a Session, deciding
what of it the browser may see, shuffling options, marking an answer as it is given, reading the
player's history and ending a sitting are written once, there. What lives in `practice.py` is the
draw, which is what makes the mode itself. It differs from the Exam in exactly three ways a caller
can see:

- **One chosen Level** (`PRACTICE_LEVELS`), because a student drills the block they have
  lessons on. The Exam is never filtered by Level; Practice always is.
- **The length they have time for** — 10, 20 or 30 (`PRACTICE_LENGTHS`), in the Exam's own
  format proportions scaled by the largest remainder method and then *written down* in
  `PRACTICE_COMPOSITION`: 5/4/1, 10/7/3, 14/11/5. Open Questions stay the largest block at
  every length.
- **The Verdict lands with the answer.** The `PUT` returns it, along with the correct answer and
  the agent's note — one model call for one Open Question, not a batch.

| Endpoint | Does |
|---|---|
| `POST /quiz/practice` | Draws at `{level, length}`. 422 `level_not_offered` / `length_not_offered`, 409 `question_bank_too_small`, 409 `exam_in_progress`. |
| `GET /quiz/practice/{id}` | The Session with the corrections on the questions already marked. |
| `PUT /quiz/practice/{id}/answers/{question_id}` | Records **and marks** one answer, returning `{verdict, correct_answer, feedback}`. |
| `POST /quiz/practice/{id}/finish` | Ends and records it. |
| `POST /quiz/practice/{id}/abandon` | Frees the slot, recording nothing. |

Rules that are not negotiable:
- **Nothing here passes or fails anybody.** `passed` is `None` on a Practice Session however it
  went — the only pass mark in the product is the Exam's, and `read_session` gates it on mode.
- **A question is answered once.** One that already carries a Verdict is closed (409
  `answer_already_graded`): being shown the right answer and then being allowed to change yours
  is not studying. A written answer the agent *could not read* carries no Verdict and is
  therefore not closed — sending it again is the retry.
- **There is no skipping.** A blank is refused (422 `answer_required`) rather than marked wrong
  on the spot, which could not be taken back.
- **Selection is adaptive**, which the Exam's deliberately is not: never-seen questions first,
  then the ones this player got wrong, then the ones they have not seen for longest. History is
  read across *every* mode, and a question that was drawn but never answered counts as never
  seen.
- **Scored on what was actually marked.** `finish` sets `max_score` to the number of questions
  carrying a Verdict, so a Session ended after four questions reads 4 of 4. A question never
  reached and an answer the agent could not read are both left out rather than counted wrong.
  This overwrites the length the Session was drawn at, so **anything reporting on Practice later
  reads the chosen length as the number of `exam_answers` rows, not from `max_score`** — one row
  exists per question drawn, so the 10, 20 or 30 is still there.
- The recap leads on the **count**, never a percentage under a badge: that shape is the Exam's
  verdict screen, and Practice must not read as one.
- The single-in-progress rule is the game's, not the mode's: `GET /quiz/exams/current` answers
  with a Practice Session just as readily and `mode` says which it is. Only `mode = exam` rows
  are Exam history.

Use `startPractice`, `fetchPracticeSession`, `savePracticeAnswer`, `finishPractice` and
`abandonPractice` in `frontend/src/lib/api.ts`; never call these endpoints from a component.

The sitting and the recap are `FeedbackSitting` / `FeedbackResult` in
`frontend/src/components/quiz/`, shared with Error Review — both modes mark as they go, so they are
one screen parameterised by mode, copy namespace and API wrappers. Every `data-testid` is prefixed
with the mode, so `practice-check` and `review-check` are the same button in two modes.

### Error Review and the Mastered rule (`backend/app/exams/review.py`)
The third mode, `mode = review`, on the same tables and the same service layer. It drills what this
player personally keeps getting wrong, and it is the only mode whose pool is finite: emptying it is
winning.

- **The pool** is every question this player has *answered* — in any mode, and whatever became of
  the Session that asked, an abandoned one included — that is `active` and not yet Mastered. A
  question drawn but never reached is not one of theirs.
- **Mastered** is `MASTERY_SESSIONS = 3` correct answers in **three distinct Sessions**. Three
  inside one sitting count once: the rule is `COUNT(DISTINCT session_id)` in
  `service.mastery_counts`, and `tests/test_review.py` asserts that from both sides of the
  boundary.
- **There is no Level and no format composition.** Both would be the game choosing the questions,
  when the player's own record already has.

| Endpoint | Does |
|---|---|
| `GET /quiz/review/pool` | `{pending, mastery_sessions}` — how many questions are still waiting. Declared **before** `/{id}`. Zero is a real answer, not an error. |
| `POST /quiz/review` | Draws at `{length}` (`REVIEW_LENGTHS`). 422 `length_not_offered`, 409 `nothing_to_review` on an empty pool, 409 `exam_in_progress`. |
| `GET /quiz/review/{id}` | The Session, plus `pending` recomputed at the moment of asking. |
| `PUT /quiz/review/{id}/answers/{question_id}` | Records **and marks** one answer, exactly as Practice does. |
| `POST /quiz/review/{id}/finish` | Ends and records it. This is what makes its correct answers count. |
| `POST /quiz/review/{id}/abandon` | Frees the slot. Nothing in it counts towards mastery. |

Rules that are not negotiable:
- **Mastery is derived, never counted.** `service.mastery_counts` reads the stored answers on every
  call; there is no counter column and there must not be one. A counter and a history can disagree,
  and this cannot — a Session that is deleted takes its contribution with it.
- **Only a submitted Session buys mastery**, and every mode's does. An abandoned Session earns
  nothing, because credit for a rule this strict has to come from a sitting that was actually
  finished — while its *mistakes* stay on record in `service.history`, because binning a Session
  does not unmake them. That asymmetry is deliberate.
- **An empty pool is a designed state.** It is refused with 409 `nothing_to_review` and the screen
  turns it into the congratulation it is, with the two ways to make more of it. It is never an
  error and never a blank screen.
- **A pool shorter than the requested length simply serves what exists** — `max_score` is
  `len(drawn)`. Refusing to show a student their last four mistakes because they asked for ten
  would be absurd.
- `pending` is on **every** review payload and recomputed each time, because the number moves
  during the Session and watching it fall is the reward the mode is built around. It only moves on
  `finish`, which is the truth about when mastery is earned.

Use `fetchErrorReviewPool`, `startErrorReview`, `fetchErrorReview`, `saveErrorReviewAnswer`,
`finishErrorReview` and `abandonErrorReview` in `frontend/src/lib/api.ts`. They are named
`ErrorReview` to keep them away from `fetchReview`, which is Mappa dei Vini's end-of-game write-up
and has nothing to do with the quiz — the same collision bites `page.route('**/review')` in the
Playwright mock, which guards against `/quiz/review` for exactly this reason.

### Grading the Open Questions (`backend/app/ai/grading.py`)
The Open Questions of a submitted Exam are graded by a **PydanticAI** agent with a typed result,
in one call carrying the whole paper (ADR 0010). `/hint`, `/memorize` and `/review` are untouched
and stay on `google-genai` — load-bearing structured output goes through PydanticAI,
conversational output does not.

- Each item carries its **question id** both ways. The returned set is checked against the sent
  set; anything missing, duplicated or carrying an unrecognised id is discarded and re-graded
  with a **single-question call**. A typed schema does not stop a well-formed Verdict about the
  question next door.
- **Nothing is ever graded wrong because a call failed.** An item that could not be graded is
  simply absent from the result and stays without a Verdict.
- The criterion is selected by `open_subtype`: **conceptual** — the answer covers the core of the
  reference answer, in any wording; **list** — it names at least as many valid items as the
  question asks for (a majority of the reference list where no number is stated), and the
  explanation reports the count achieved against the count required.
- Explanations are written in the interface language; questions and reference answers stay in
  Italian.
- In tests the agent is patched at its import site — `app.exams.router.grade_open_answers` for
  the endpoint, `app.ai.grading.run_batch` for the verification logic — exactly as
  `tests/test_ai.py` patches the Gemini calls. No test reaches a model.

### Session persistence (Mappa dei Vini)
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

The backend has **two** ways of talking to a model, on purpose (ADR 0010): these three stay on
`google-genai` with free-text prompts; the Exam's Open Question grading runs on **PydanticAI**
with a typed result (`backend/app/ai/grading.py`). The rule for anything new: load-bearing,
structured output goes through PydanticAI, conversational output stays on `google-genai`.

**Never call these endpoints directly from components.** Use the typed wrappers in `frontend/src/lib/api.ts` (`fetchHint`, `fetchMemorizeTip`, `fetchReview`, `fetchDenominations`, `fetchSaveSession`, `fetchSessionStats`). The prompt logic lives in `backend/app/ai/gemini.py`.

### i18n
- Translation files: `frontend/src/messages/en.json`, `frontend/src/messages/it.json`
- Language toggle in the global `Header` component; persists via locale routing
- Denomination names are **always in Italian** regardless of UI language

### Design system (Tannino Incazzato)
The frontend follows the **Tannino Incazzato** brand ("Bun" style: soft mascot, round chunky type,
pill shapes, anti-snob voice). **Full spec: [`frontend/DESIGN.md`](frontend/DESIGN.md) — read it before building or restyling any UI.** Hard rules:
- **Never hardcode colors/radii/fonts** — use the CSS tokens in `frontend/src/app/globals.css`
  (`var(--primary)`, `var(--accent)`, …) or their Tailwind theme colors (`text-ink`, `bg-surface`).
- **Pill (`border-radius:999px`) all buttons/badges/chips/progress bars; large radii on cards.**
- **Cobalt `--accent` = actions only** (CTAs, links, focus, active segments); **bordeaux `--primary` = identity/data** (brand, badges, scores).
- **Fonts:** Baloo 2 (display) + Nunito (body) via `--font-display`/`--font-sans`.
- **Use `Mascot` (`src/components/Mascot.tsx`)** for the brand — pick the mood (`angry`/`skeptical`/`happy`/`lost`) matching the state; never inline a new mascot SVG.
- **Copy uses the Tannino voice** and lives in `src/messages/{en,it}.json` — never hardcoded.

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
│       │   └── quiz/         # mode landing; exam/[examId], practice/[sessionId] and
│       │                     #   review/[sessionId] sitting + result screens
│       ├── components/
│       │   ├── game/          # PostIt, ScoreCounter, AutoPlaceModal
│       │   ├── map/           # ItalyMap, RegionPanel
│       │   ├── quiz/          # QuestionCard, Breakdown, ConfirmSheet, and
│       │   │                  #   FeedbackSitting/FeedbackResult (Practice + Error Review)
│       │   └── recap/         # RecapStats, AIReview
│       ├── context/
│       │   └── AuthContext.tsx   # AuthProvider + useAuth() hook
│       ├── data/denominations.json   # ingestion source only — not imported by app
│       ├── i18n/              # next-intl routing, request config, navigation
│       ├── lib/
│       │   ├── api.ts         # typed client wrappers for game API endpoints
│       │   ├── auth.ts        # typed client wrappers for auth endpoints
│       │   ├── exam.ts        # paper shape mirrored from the backend
│       │   ├── examTime.ts    # elapsed-time hook + duration formatting
│       │   ├── practice.ts    # Levels, lengths and open-question counts on offer
│       │   ├── review.ts     # Error Review lengths and the Mastered threshold
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
│   │   │   ├── gemini.py      # Gemini prompt functions (google-genai)
│   │   │   ├── grading.py     # PydanticAI grading agent + batch verification
│   │   │   └── router.py      # POST /hint, /memorize, /review
│   │   ├── auth/
│   │   │   ├── jwt.py         # create/verify JWT, set/clear HttpOnly cookie
│   │   │   └── router.py      # POST /auth/register|login|logout, GET /auth/me|google|google/callback
│   │   ├── denominations/
│   │   │   ├── model.py       # SQLModel table + Pydantic response schema
│   │   │   └── router.py      # GET /denominations
│   │   ├── questions/
│   │   │   ├── model.py       # Question SQLModel table
│   │   │   └── seed.py        # seed CSV → Question rows
│   │   ├── exams/             # every mode of Promossi o Cirrotici — see ADR 0008
│   │   │   ├── model.py       # ExamSession + ExamAnswer tables, compositions, pass mark
│   │   │   ├── service.py     # the layer every mode shares (read/load/mark/history/mastery)
│   │   │   ├── router.py      # POST /quiz/exams, GET current/{id}, PUT answer, submit/abandon/grade
│   │   │   ├── practice.py    # POST /quiz/practice, GET/{id}, PUT answer (+verdict), finish/abandon
│   │   │   └── review.py      # GET /quiz/review/pool, POST /quiz/review, …  Error Review + Mastered
│   │   ├── sessions/
│   │   │   ├── model.py       # GameSession + SessionCardAttempt SQLModel tables
│   │   │   └── router.py      # POST /session, GET /session/stats
│   │   ├── users/
│   │   │   └── model.py       # User SQLModel table + UserRead schema
│   │   ├── database.py        # SQLModel engine + get_session dependency
│   │   └── main.py            # FastAPI app, CORS (allow_credentials=True), router registration
│   ├── alembic/               # migration scripts
│   ├── data/                  # ingestion sources (ADR 0003, ADR 0011)
│   │   ├── denominations.json
│   │   └── question_bank.csv   # question bank seed — loaded once
│   ├── scripts/
│   │   ├── ingest_denominations.py
│   │   └── seed_questions.py  # seed-once loader (no-op if the bank is loaded)
│   └── tests/                 # pytest suite (test_auth.py, test_denominations.py, test_sessions.py, test_exams.py, test_practice.py, test_review.py …)
│
├── infra/
│   └── docker-compose.yml     # PostgreSQL 17
│
└── start.sh                   # unified startup script
```

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `Luke035/sommelier_game`, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
