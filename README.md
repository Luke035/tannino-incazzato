# 🍷 Sommelier Game

> An interactive learning tool for sommelier students to master Italian wine geography through drag-and-drop.

Place **DOC** and **DOCG** wine denomination cards onto the correct regions of an SVG map of Italy. Get AI-powered hints when you're wrong, earn points for precision, and review your session with a full AI recap.

---

## 🎮 How it works

```
┌─────────────────────────────────────────────────────────────────┐
│                        GAME SCREEN                              │
│                                                                 │
│  ┌──────────────────────────┐   ┌──────────────────────────┐   │
│  │                          │   │  🏆 Score: 42            │   │
│  │    🗺️  SVG Map of Italy  │   │                          │   │
│  │                          │   │  ┌──────────────┐        │   │
│  │   Drop the card on the   │   │  │  Prosecco 🗒️ │        │   │
│  │   correct region ──────► │   │  │     DOC      │        │   │
│  │                          │   │  │   ● ●        │        │   │
│  │                          │   │  └──────────────┘        │   │
│  │                          │   │                          │   │
│  │                          │   │  ❌ ○ ○  wrong attempts  │   │
│  │                          │   │                          │   │
│  │                          │   │  💡 Hint: This wine      │   │
│  │                          │   │  comes from the Veneto   │   │
│  │                          │   │  hills near Treviso…     │   │
│  └──────────────────────────┘   └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 🔄 Game flow

```
  Start
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

### 🏅 Scoring

| Wrong attempts | Points earned |
|:--------------:|:-------------:|
| 0              | ⭐⭐⭐ 3      |
| 1              | ⭐⭐ 2        |
| 2              | ⭐ 1          |
| 3 (auto-placed)| 0             |

Multi-region denominations (e.g. Prosecco spans Veneto + Friuli) must be placed in **all** correct regions. A single wrong-attempt counter tracks the whole card.

---

## 🤖 AI features

Three Gemini-powered endpoints respond in the user's selected language (EN/IT):

| Endpoint | When | What it does |
|----------|------|--------------|
| `POST /api/hint` | After a wrong drop | Gives a geographic or cultural clue |
| `POST /api/memorize` | In the auto-place modal | Provides a memory tip to remember the region |
| `POST /api/review` | Recap screen | Full session analysis with strengths & weaknesses |

---

## 🗺️ Screens

```
  ┌──────────┐     start game     ┌──────────┐    session end    ┌──────────┐
  │  Setup   │ ─────────────────► │   Game   │ ────────────────► │  Recap   │
  │  screen  │                    │  screen  │                   │  screen  │
  └──────────┘                    └──────────┘                   └──────────┘
  Filter: DOC /                   Map + post-it                  Stats + AI
  DOCG / both                     drag-and-drop                  review
```

---

## 🛠️ Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Drag & Drop | dnd-kit with custom SVG collision detection |
| Map | `@svg-maps/italy` (20 regions) |
| AI | Google Gemini (`gemini-3.1-flash-lite-preview`) |
| i18n | next-intl — EN 🇬🇧 / IT 🇮🇹 |
| Testing | Vitest |

---

## 🚀 Getting started

```bash
# 1. Set your Gemini API key
echo "GEMINI_API_KEY=your_key_here" > .env.local

# 2. Install dependencies
npm install

# 3. Run the dev server
npm run dev
# → http://localhost:3000
```

---

## 🧪 Testing

```bash
npm run test        # run all tests once
npm run test:watch  # watch mode for TDD
```

Tests cover the pure library functions in `src/lib/` (scoring, region mapping, recap stats). Browser-dependent and AI/API code is excluded from unit tests.

| File | What's tested |
|------|---------------|
| `lib/gameLogic.ts` | `scoreForCard`, `maxPossibleScore`, `computeRecapStats` |
| `lib/regionMapping.ts` | `regionToSvgId`, `svgIdToDisplay`, round-trip invariant against all entries in `denominations.json` |

---

## 📁 Project structure

```
src/
├── app/
│   ├── [locale]/
│   │   ├── page.tsx          # Setup screen
│   │   ├── game/page.tsx     # Game screen
│   │   └── recap/page.tsx    # Recap screen
│   └── api/
│       ├── hint/             # AI hint endpoint
│       ├── memorize/         # AI memory tip endpoint
│       └── review/           # AI session review endpoint
├── components/
│   ├── game/                 # PostIt, ScoreCounter, AutoPlaceModal
│   ├── map/                  # ItalyMap, RegionPanel
│   └── recap/                # RecapStats, AIReview
├── data/
│   └── denominations.json    # 410 DOC/DOCG entries
├── lib/
│   ├── api.ts                # Typed client wrappers for AI endpoints
│   ├── gameLogic.ts          # Scoring, shuffling, recap stats
│   ├── gemini.ts             # Gemini prompt functions
│   ├── regionMapping.ts      # JSON name ↔ SVG ID conversion
│   └── svgCollision.ts       # Pixel-perfect SVG hit detection
└── messages/
    ├── en.json
    └── it.json
```

---

## 🍇 Data model

Each denomination in `denominations.json`:

```json
{
  "name": "Prosecco",
  "type": "DOC",
  "regions": ["Veneto", "Friuli Venezia Giulia"]
}
```

410 entries covering all Italian DOC and DOCG appellations. `regions` is always an array — many denominations span multiple regions.
