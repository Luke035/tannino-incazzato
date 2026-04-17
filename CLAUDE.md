@AGENTS.md

# Sommelier Game

A web app for sommelier students to learn the regional collocations of Italian DOC/DOCG wine denominations via drag-and-drop on an SVG map of Italy.

## Running the project

```bash
# Requires a Gemini API key
echo "GEMINI_API_KEY=your_key" > .env.local
npm run dev       # http://localhost:3000
npm run build     # production build (run this to verify before committing)
npm run test      # run test suite once
npm run test:watch  # TDD watch mode (re-runs on save)
```

## Tech stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **dnd-kit** for drag-and-drop (`@dnd-kit/core`, `@dnd-kit/utilities`)
- **@svg-maps/italy** for the SVG map (20 regions, English kebab-case IDs)
- **next-intl** for i18n (EN/IT, locale-based routing under `src/app/[locale]/`)
- **@google/generative-ai** — Gemini model `gemini-3.1-flash-lite-preview`
- **Vitest** for testing (pure lib functions; no browser/API tests)
- No backend, no database, no auth

## Key conventions

### Data model
Denominations live in `src/data/denominations.json` (410 entries, generated from `vini_italiani.json`):
```json
{ "name": "Prosecco", "type": "DOC", "regions": ["Veneto", "Friuli Venezia Giulia"] }
```
`regions` is **always an array** — denominations can span multiple regions.

### Region naming
Two separate namespaces — always use the mapping functions, never hardcode:
- **Italian display names** (used in `denominations.json` and `placedCards` keys): `"Emilia-Romagna"`, `"Valle d'Aosta"`, `"Puglia"` …
- **SVG IDs** (used by `@svg-maps/italy` and dnd-kit droppable IDs): `"emilia-romagna"`, `"aosta-valley"`, `"apulia"` …
- Conversion: `regionToSvgId(italian)` and `svgIdToDisplay(svgId)` in `src/lib/regionMapping.ts`

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
The default dnd-kit bounding-box collision detection is replaced with a custom `svgCollisionDetection` (`src/lib/svgCollision.ts`) that uses `document.elementFromPoint` for pixel-perfect hit-testing on SVG paths. The post-it uses `pointerEvents: none` while dragging so the cursor reaches the SVG beneath it.

### AI endpoints
All three Gemini endpoints live under `src/app/api/`:
- `POST /api/hint` — hint after a wrong drop (during game)
- `POST /api/memorize` — memory tip shown in the auto-place modal
- `POST /api/review` — full session review shown on the recap screen

All prompts pass a `language` field (`"en"` or `"it"`) so Gemini responds in the correct language.

### i18n
- Translation files: `src/messages/en.json`, `src/messages/it.json`
- Language toggle in the global `Header` component; persists via locale routing
- Denomination names are **always in Italian** regardless of UI language

## Project structure

```
src/
  app/[locale]/          # Setup, game, and recap screens
  app/api/               # hint, memorize, review endpoints
  components/
    game/                # PostIt, ScoreCounter, AutoPlaceModal
    map/                 # ItalyMap, RegionPanel
    recap/               # RecapStats, AIReview
  data/denominations.json
  i18n/                  # next-intl routing, request config, navigation
  lib/
    gameLogic.ts         # scoring, shuffling, recap stats
    gemini.ts            # Gemini client helpers
    regionMapping.ts     # Italian name <-> SVG ID conversion + centroids
    svgCollision.ts      # Custom dnd-kit collision detection for SVG maps
    __tests__/           # Vitest unit tests for pure lib functions
  messages/en.json
  messages/it.json
  middleware.ts          # next-intl locale routing
  types/index.ts         # Denomination, CardAttempt, SessionState, Filter …
```
