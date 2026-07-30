# Promossi o Cirrotici gets its own session tables

Sessions and answers for the quiz game live in dedicated `exam_sessions` and `exam_answers`
tables. `game_sessions` and `session_card_attempts` are left untouched and keep serving Mappa
dei Vini alone.

`game_sessions` models a **finished** game: `score`, `max_score` and `duration_seconds` are all
NOT NULL, and every consumer assumes each row is a completed run. A quiz Session must exist
while it is still in progress (ADR 0007 persists it at creation), so it needs a status and a
score that is absent until submission — a different entity wearing the same name.

## Considered Options

**Reusing `game_sessions` with a nullable score and a status column** — one header table for all
games and profile statistics already unified. Rejected because it changes the schema of a game
running in production, and every existing query would have to learn to ignore in-progress rows:
a regression risk on Mappa dei Vini in exchange for a cosmetic gain.

**Dedicated tables that also write a summary row into `game_sessions` on submission** — rejected
as duplicated truth: two rows describing one score, free to diverge.

## Consequences

- The profile screen reads two sources and shows two sections. This matches the intent: the two
  games measure different things and their scores must not be averaged together.
- `exam_answers` holds one row per question served, which is what makes Error Review possible —
  it has to answer "which questions has this player got wrong, in any mode".
- `GET /session/stats` already filters by `game_id`, so Mappa dei Vini's statistics are unaffected.
