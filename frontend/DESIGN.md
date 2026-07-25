# Design System — Tannino Incazzato

Operational design spec for the **Tannino Incazzato** frontend. This is the source of truth
for any new UI. Follow it for every screen and component. The visual direction is **"Bun"**:
soft mascot as the brand, round chunky type, generous radii, pill buttons — warm, playful,
anti-snob. The platform is **Tannino Incazzato**; the game inside it is **Mappa dei Vini**
(Wine Map).

> The original design handoff (HTML mockups + README) lives locally in
> `design_handoff_tannino_incazzato/` (gitignored — not in the repo). Those are **mockups, not
> code to copy**. This file is the distilled, authoritative spec; where a mockup and an existing
> component diverge, **the existing component structure wins — only the skin changes**.

---

## Hard rules (read first)

1. **Never hardcode colors, radii, or fonts.** Use the CSS tokens in
   `src/app/globals.css` (`var(--primary)`, `var(--accent)`, …) or the Tailwind theme colors
   they map to (`text-ink`, `bg-surface`, `border-border`, …). No raw hex in components.
2. **Pill everything interactive.** All CTAs, buttons, badges, chips, and progress bars use
   `border-radius: 999px` (utility `.pill`). Cards use large radii (20–24px, utility
   `.card-rounded`).
3. **Cobalt (`--accent`) is for ACTIONS only** — CTAs, links, focus rings, active segments,
   eyebrows. **Bordeaux (`--primary`) is for IDENTITY/DATA** — brand, badges, scores, the
   mascot body. Keeping these two roles separate is what keeps the brand awake.
4. **Fonts:** Baloo 2 for display/titles/logo/scores; Nunito for body/UI/labels. Use the
   `--font-display` / `--font-sans` tokens, never a raw font name.
5. **Use the `Mascot` component** (`src/components/Mascot.tsx`) for the brand — never inline a
   new drop SVG. Pick the mood that matches the state (see Mascot section).
6. **Copy uses the Tannino voice** (direct, witty, anti-snob — see Voice & Tone). New user-facing
   strings go in `src/messages/{en,it}.json`, never hardcoded in components.

---

## Color tokens — Aperitivo (single theme)

Defined in `src/app/globals.css` under `:root`, exposed to Tailwind via `@theme`.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F2EDE4` | page background (warm paper) |
| `--surface` | `#FBF8F2` | cards / panels |
| `--surface-2` | `#F8F3EA` | game sidebar / inner panels |
| `--soon` | `#EFE8DC` | "coming soon" cards, segmented-control track |
| `--card` | `#FFFFFF` | flashcard |
| `--ink` | `#241016` | primary text (warm brown-bordeaux) |
| `--muted` | `#6F6356` | secondary text |
| `--faint` | `#9A8A78` | tertiary text / placeholder |
| `--border` | `#E2DACE` | borders |
| `--primary` (bordeaux) | `#7A132A` | brand, badges, scores, data, mascot body |
| `--primary-bright` | `#E0566A` | mascot/accent on dark backgrounds |
| `--accent` (cobalt) | `#2438FF` | **CTAs**, eyebrow, focus ring, active segments, links |
| `--rust` | `#C2562B` | warm accent / hint text |
| `--correct` (green) | `#3F7A47` | correct state / "Disponibile" badge |
| `--dark` | `#241016` | dark panels (login, tutor). On it: text `#F0E6DC`, accent `#7FA0FF` |
| `--topbar` | `#E8E2D7` | mock window bar |

**Hint panel:** bg `#FBF1EC`, border `#E7C3B3`, text `#C2562B`/`#6A4A3A`, with the **angry**
mascot ("Il tannino brontola").

---

## Typography

| Use | Font | Weights | Notes |
|---|---|---|---|
| Display / titles / logo / scores | **Baloo 2** | 600–800 | round, chunky; titles `line-height ~0.95` |
| Body / UI / labels | **Nunito** | 400–900 | uppercase labels `letter-spacing 0.12–0.18em`, `font-weight 800` |

**Scale:** hero `clamp(2.4rem, 6vw, 4rem)`; screen H1 `2.4rem`; card title `1.5rem`; big score
`3.2rem`; body `0.86–0.92rem`; label `0.56–0.66rem`.

---

## Shape language (the key to the "Bun" style)

- **Radii:** cards `20–24px` · inner stat/boxes `16–18px` · inputs `12–14px` · icon tiles `13–17px`.
- **Pills (`border-radius:999px`):** ALL buttons (primary + ghost), badges/chips, progress bars
  (height 7–8px).
- **Segmented control:** pill track `--soon` with padding; active segment = filled `--primary` pill.
- **Soft shadows:** screen cards `0 14px 44px rgba(36,16,22,0.14)` (`.soft-shadow`);
  cobalt CTA `0 8px 22px rgba(36,56,255,0.3)` (`.cta-shadow`);
  flashcard `0 12px 28px rgba(36,16,22,0.16)` (`.card-shadow`).
- **Hit targets ≥ 44px.**

Shared utilities live in `globals.css`: `.pill`, `.card-rounded`, `.soft-shadow`, `.cta-shadow`,
`.card-shadow`, plus `.auth-*`, `.profile-stat-card`, `.session-row`.

---

## The mascot — "Tannino"

A round, sulky **wine drop** (cute but angry). It's the heart of the brand and changes face by
game state. Implemented as `Mascot({ mood, size, className })` in `src/components/Mascot.tsx`;
body is `--primary`, facial strokes are "cut out" in the background color (`currentColor` = bg).

| `mood` | When to use |
|---|---|
| `angry` | wrong drop / hint panel |
| `skeptical` | idle / waiting / empty state (default on setup & game cards) |
| `happy` | correct answer / high recap score |
| `lost` | loading / spinner state |

**Where it appears:** as the logo in `Header`; in the hint panel (`PostIt`, `angry`); atop the
recap (`happy`/`angry` by score); in empty/loading states; as favicon/app-icon (`src/app/icon.svg`).

**Wordmark:** all-lowercase, Baloo 2 ExtraBold — `tannino` (`--ink`) + `incazzato` (`--primary`).
Horizontal lockup (mascot left) for headers; stacked for splash/login.

---

## Voice & tone (copy)

Persona **"il Tannino"**: the in-house tutor of an anti-snob wine-learning app. Informal ("tu" in
Italian), direct, witty, a little cheeky, never pretentious. Short punchy sentences. No purple
tasting-note clichés, no lecturing. May tease a wrong answer but stays warm and genuinely useful —
the joke never replaces the teaching. One light quip per message, max.

| Context | Copy |
|---|---|
| Tagline | «Niente pose. Solo vino.» |
| Start CTA | «Versa e gioca →» |
| Wrong answer | «Eh no. Il tannino s'incazza.» |
| Recap title / CTA | «Il verdetto del tannino» · «Ancora un giro →» |

**AI tutor prompts** (`backend/app/ai/gemini.py` — `generate_hint`/`generate_memorize_tip`/
`generate_review`) carry this persona. Functional constraints to preserve: hint 1–2 sentences
without naming the region; memorize tip 2–3 mnemonic sentences; review 3–5 sentences (error
pattern + what went well + 1–2 tips). All prompts take a `language` field (`"en"`/`"it"`).

---

## Where the system lives in code

- **Tokens + utilities:** `src/app/globals.css`
- **Mascot:** `src/components/Mascot.tsx` · **app-icon:** `src/app/icon.svg`
- **Copy:** `src/messages/en.json`, `src/messages/it.json`
- **AI persona:** `backend/app/ai/gemini.py`

When adding UI: reach for existing tokens/utilities/components first; only add a new token if the
value is genuinely new, and add it to `globals.css` (never inline).
