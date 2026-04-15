# Sommelier Game — Implementation Plan

A web app for sommelier students to learn the regional collocations of DOC and DOCG denominations in Italy through a drag-and-drop game.

---

## Tech Stack

- **Framework**: Next.js (App Router) + TypeScript
- **Styling**: Tailwind CSS (WineFolly-inspired design)
- **Drag-and-drop**: dnd-kit
- **AI hints + session review**: Google Gemini via Next.js API route (`/api/hint`, `/api/review`)
  - Model: `gemini-3.1-flash-lite-preview`
  - Env var: `GEMINI_API_KEY`
  - SDK: `@google/generative-ai`
- **i18n**: `next-intl` for UI strings; supported languages: **English** (default) and **Italian**
- **Persistence**: none (future feature)
- **Mobile**: desktop-only; show a "best experienced on desktop" message on small screens
- **Deployment**: Vercel

---

## Data

A static JSON file at `src/data/denominations.json` sourced from `vini_italiani.json` (Italian Ministry registry data, already in the project root):

```json
[
  { "name": "Barolo", "type": "DOCG", "regions": ["Piemonte"] },
  { "name": "Prosecco", "type": "DOC", "regions": ["Veneto", "Friuli-Venezia Giulia"] }
]
```

Fields: `name` (string), `type` ("DOC" | "DOCG"), `regions` (array — one or more of Italy's 20 regions).

**Multi-regional denominations are valid**: a drop is correct if the target region is any element of the `regions` array. All valid regions are highlighted on the map when a multi-regional card is active.

Source: `vini_italiani.json` in the project root (411 entries, already provided by user).

---

## Map

- **SVG map** of Italy's 20 administrative regions (sourced from Wikimedia Commons)
- One `<path>` per region with a stable `id` matching the region name
- Regions are dnd-kit **droppable** targets
- Each region displays a **badge counter** (e.g. "3") when cards have been placed in it
- Clicking a region opens a **side panel** listing all placed denominations with color indicators:
  - Green = placed correctly (within 3 attempts)
  - Red = auto-placed after 3 failures
- WineFolly-inspired color palette: warm creams, deep reds, gold accents

---

## Screen Flow

### 1. Setup Screen
- App logo / title
- Filter toggle: **DOC / DOCG / Both**
- "Start Session" button

### 2. Game Screen (two-column layout)
- **Left column**: SVG map of Italy (drop target)
- **Right column**:
  - Current post-it card (denomination name + DOC/DOCG badge)
  - Attempt indicator (attempt 1/2/3)
  - Hint bubble (appears after each wrong attempt, AI-generated)
  - Session score counter (running total)
  - "End Session" button

### 3. Session Recap Screen
- Total cards attempted
- Breakdown: correct on 1st / 2nd / 3rd attempt / auto-placed (0 points)
- Total score (with max possible score)
- Breakdown by region (strongest / weakest)
- AI-generated personalized review (based on full attempt history): insights, patterns in errors, and concrete suggestions for improvement
- "Start New Session" button

---

## Game Logic

### Session
- Cards drawn randomly from the filtered denomination list
- Session continues until either:
  - All filtered denominations are exhausted
  - User clicks "End Session"
- No persistence between sessions

### Attempt Flow (per card)

**Single-region denomination:**
1. Post-it displayed on the right panel
2. User drags post-it onto a region
3. **Correct drop**: post-it animates into the region; score updated; next card shown
4. **Wrong drop** (wrong attempts 1 or 2): AI hint displayed; user tries again
5. **Wrong drop** (wrong attempt 3): auto-placed in correct region (red indicator); next card shown

**Multi-regional denomination** (e.g. Prosecco DOC spans Veneto + Friuli-Venezia Giulia):
1. Post-it displayed showing all required regions and a "remaining regions" counter
2. User drops on a region — **shared wrong-attempt counter** across all placements
3. **Correct drop** for one of the regions: that region is checked off on the post-it and highlighted on the map; post-it stays active
4. Repeat until ALL regions are found → card complete; score awarded; next card shown
5. **Wrong drop** (wrong attempts 1 or 2): AI hint displayed; counter incremented
6. **Wrong attempt 3**: all remaining unfound regions are auto-placed (red indicators); next card shown

### Scoring (per card — same rule for single and multi-regional)
| Wrong attempts on card | Points |
|---|---|
| 0 wrong attempts | 3 |
| 1 wrong attempt | 2 |
| 2 wrong attempts | 1 |
| 3 wrong attempts (auto-place) | 0 |

---

## AI Integration

### Hint (during game)
- Triggered after each wrong drop (up to 2 hints per card)
- API route: `POST /api/hint`
- Payload: `{ denomination, type, wrongRegion, correctRegions: string[], remainingRegions: string[], attemptNumber, language }`
- Prompt: act as an encouraging wine tutor; give a geographic or cultural clue without naming the correct region(s) directly; for multi-regional cards, hints can reference that the denomination spans multiple areas

### Session Review (recap screen)
- Triggered once when recap screen is shown
- API route: `POST /api/review`
- Payload: full attempt history (denomination, correctRegions, wrongAttempts, result)
- Prompt: provide a personalized assessment — patterns in errors, geographic areas to focus on, study suggestions

---

## Project Structure

```
src/
  app/
    page.tsx                  # Setup screen
    game/page.tsx             # Game screen
    recap/page.tsx            # Session recap screen
    api/
      hint/route.ts           # Gemini hint endpoint
      review/route.ts         # Gemini review endpoint
  components/
    map/
      ItalyMap.tsx            # SVG map with droppable regions
      RegionPath.tsx          # Individual region path + badge
      RegionPanel.tsx         # Side panel listing placed cards
    game/
      PostIt.tsx              # Draggable post-it card
      HintBubble.tsx          # AI hint display
      ScoreCounter.tsx        # Running score
      SessionControls.tsx     # End Session button
    recap/
      RecapStats.tsx          # Statistics breakdown
      AIReview.tsx            # AI review display
  data/
    denominations.json        # Full DOC/DOCG dataset
  lib/
    gemini.ts                 # Gemini client wrapper
    gameLogic.ts              # Scoring, session state helpers
  messages/
    en.json                   # English UI strings
    it.json                   # Italian UI strings
  types/
    index.ts                  # Shared TypeScript types
```

---

## Internationalisation

- Language selector: **persistent toggle in the global header** (EN / IT flag), switchable at any time
- **Denomination names always stay in Italian** — they are official proper names and are never translated
- Everything else adapts: all UI chrome, labels, buttons, error messages
- AI prompts include the selected language so Gemini responds in the correct language for both hints and the session review
- Translation files at `src/messages/en.json` and `src/messages/it.json`

---

## Future Features (out of scope for v1)
- Mobile support (tap-to-select mechanic instead of drag-and-drop)
- Score persistence across sessions (localStorage or user accounts)
- Filter by macro-area (Nord / Centro / Sud)
- Filter by region
- Multi-country support (France, Spain, etc.)
