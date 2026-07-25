# Sommelier Game

A web app where sommelier students learn the regional collocations of Italian DOC/DOCG
wine denominations by drag-and-dropping cards onto an SVG map of Italy. This file is the
shared glossary; it captures the meaning of terms, not implementation details.

## Language

### Brand & product

**Tannino Incazzato**:
The consumer-facing name of the *platform* (the product as a whole). Replaces the former
user-facing names "Sommelier Game" / "Sommelier Italia". Lowercase wordmark.
_Scope_: user-facing only — copy, page title/metadata, wordmark, favicon. Code identifiers,
package names, the repo folder, the database, and internal docs keep the name `sommelier_game`.
_Avoid_ (as a user-facing name): Sommelier Game, Sommelier Italia.

**Mappa dei Vini** / **Wine Map**:
The single game currently inside the platform — the existing drag-and-drop map exercise.
The platform is designed to host multiple games; this is the only one that is live. The display
title is localized ("Wine Map" on EN, "Mappa dei Vini" on IT), but the URL slug is always the
English `wine-map` regardless of locale (e.g. `/it/wine-map` shows "Mappa dei Vini").
_Avoid_: "the game" (ambiguous once more games exist), Sommelier Game.

**Tannino** (the mascot):
A rounded wine-drop character with a sulky/angry face that is the heart of the brand. Serves
two roles: the **logo/mascot** in headers and empty states, and the persona of the **AI tutor**
("il Tannino"). It has four moods — `angry`, `skeptical`, `happy`, `lost` — driven by game events.
_Avoid_: "the logo" when you specifically mean the mascot character.

**Aperitivo**:
The single visual theme (warm-paper palette: bordeaux `--primary`, cobalt `--accent`). There is
no light/dark toggle — one theme only.
