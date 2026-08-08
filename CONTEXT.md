# Sommelier Game

A web platform of games that prepare sommelier students for their certification exam. This
file is the shared glossary; it captures the meaning of terms, not implementation details.

## Language

### Brand & product

**Tannino Incazzato**:
The consumer-facing name of the *platform* (the product as a whole). Replaces the former
user-facing names "Sommelier Game" / "Sommelier Italia". Lowercase wordmark.
_Scope_: user-facing only — copy, page title/metadata, wordmark, favicon. Code identifiers,
package names, the repo folder, the database, and internal docs keep the name `sommelier_game`.
_Avoid_ (as a user-facing name): Sommelier Game, Sommelier Italia.

**Mappa dei Vini** / **Wine Map**:
The drag-and-drop map game, in which students place denomination cards onto the regions of an
SVG map of Italy. The display title is localized ("Wine Map" on EN, "Mappa dei Vini" on IT),
but the URL slug is always the English `wine-map` regardless of locale (e.g. `/it/wine-map`
shows "Mappa dei Vini"). Drag-and-drop confines it to the desktop.
_Avoid_: "the game" (ambiguous — there is more than one), Sommelier Game.

**Promossi o Cirrotici: Il Gioco Finale** / **Graduated or Decanted?**:
The question-bank game, in which students answer certified sommelier-course exam questions. The display
title is localized and deliberately asymmetric — the Italian carries a subtitle, "Il Gioco
Finale", that the English does not — while the URL slug is always the English `quiz`. Unlike
Mappa dei Vini it is **mobile-first**.
_Avoid_: "the exam" as a name for the whole game — Exam is only one of its three modes.

**Tannino** (the mascot):
A rounded wine-drop character with a sulky/angry face that is the heart of the brand. Serves
two roles: the **logo/mascot** in headers and empty states, and the persona of the **AI tutor**
("il Tannino"). It has four moods — `angry`, `skeptical`, `happy`, `lost` — driven by game events.
_Avoid_: "the logo" when you specifically mean the mascot character.

**Aperitivo**:
The single visual theme (warm-paper palette: bordeaux `--primary`, cobalt `--accent`). There is
no light/dark toggle — one theme only.

### Promossi o Cirrotici

**Written Exam**:
The final written exam of the sommelier certification course this game prepares for — a single
sitting covering all three course levels at once.
_Avoid_: naming the certifying body anywhere in the product, the code or the docs.

**Question Bank**:
The body of questions the game draws from. The database is its source of truth. It was once
certified course material by construction; now that questions can be written in the platform, every
question carries its Provenance instead.
_Avoid_: "the CSV", "the questions file" — the CSV only ever seeded the bank.

**Provenance**:
Where a question came from: **certified**, transcribed from the course's material, or **authored**,
written in the platform. Every question carries exactly one, so a question drawn into an Exam can
always be traced back to whether it is exam material or not.
_Avoid_: origin, custom question, "my questions".

**Correction**:
A change to a question the bank already holds. At steady state a Correction is a single deliberate
act by an Admin, taking effect immediately. The committed corrections file is a different thing: a
bulk remediation against an external dated authority, not the everyday path.
_Avoid_: edit, fix, patch, update.

**Level**:
The sommelier course level a question belongs to: 1 (viticulture, oenology, tasting, service),
2 (Italian and world wine regions), 3 (food pairing and nutrition).
_Avoid_: difficulty — a Level 3 question is not harder than a Level 1 one, it is about
different material.

**Topic**:
What a question is about, distinct from its Level — one of a fixed ten-slug taxonomy (see
[`docs/question-bank-classification.md`](docs/question-bank-classification.md)), classified
offline and committed as seed data. Every question carries exactly one. Drives profile
statistics by subject ("40% on sparkling wine production" rather than "40% on Level 1").
_Avoid_: Level (Level is course material grouping, Topic is subject matter).

**Session**:
One run of one mode, from its first question to the moment it is submitted or abandoned.
_Avoid_: game, round, attempt.

**Exam**:
A 30-question Session drawn blind from the whole Question Bank, spanning all three Levels,
graded only once submitted. Passed at 18/30.
_Avoid_: test, quiz (Quiz is the game; Exam is one of its modes), mock exam.

**Practice**:
A 10, 20 or 30-question Session on one chosen Level, with feedback after every answer. Nothing
is passed or failed.
_Avoid_: training, free play, study mode.

**Error Review**:
A Session drawn only from the player's own questions that are not yet Mastered.
_Avoid_: revision, repetition, redo.

**Mastered**:
What a question becomes, for one player, after three correct answers given in three distinct
Sessions. A Mastered question leaves that player's Error Review pool.
_Avoid_: learned, acquired, passed.

**Closed Question**:
A true/false or three-option multiple-choice question, judged by exact comparison. Its options
are always shuffled before it is served.
_Avoid_: multiple choice (that is one of the two kinds), objective question.

**Open Question**:
A question answered in free text and judged by il Tannino. Every Open Question is either
**conceptual** — acceptable when the answer covers the core of the reference answer, in any
words — or **list** — acceptable when it names at least as many valid items as the question
asks for.
_Avoid_: essay question, written question.

**Verdict**:
The outcome of judging one answer: acceptable or not. Binary, never partial.
_Avoid_: score (a score counts Verdicts across a Session), mark, grade.

### Administration

**Admin**:
A player who may also govern the platform: correct the Question Bank, suspend an account, take a
game offline. Being an Admin says what someone may govern, never what they may play — an Admin
holds a Plan and can be Suspended like anybody else.
_Avoid_: superuser, moderator, staff, owner.

**Suspended**:
An account an Admin has closed to play. A Suspended player still signs in and still sees the
platform; every game is simply shown greyed and refuses to open. It is a state of an account, and
it is always for one person.
_Avoid_: banned, blocked, deleted, and especially deactivated — a *question* is deactivated, an
*account* is Suspended.

**Plan**:
What a player is entitled to use — **free** or **premium** — as distinct from what they may govern
(Admin) and from whether they may play at all (Suspended). Both names exist today and nothing in
the game reads them yet.
_Avoid_: role, tier, subscription (nothing is being sold), premium user.

**Availability**:
Whether a game can be reached at all: **published** (playable), **maintenance** (shown, refused,
and explained) or **hidden** (not shown). Availability is always set for everybody at once, which
is what separates it from Suspended and from Plan.
_Avoid_: enabled/disabled, feature flag, toggle.
