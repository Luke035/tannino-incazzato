# The database is the source of truth for the Question Bank

`question_bank.csv` seeds the `question` table once and is then done. Corrections to a
question, an answer or an explanation are made in the database, not in the file and re-ingested.

This deliberately departs from the pattern of ADR 0003, where `denominations.json` is a
re-runnable ingestion source. The difference is that nothing points at a denomination, whereas
`exam_answers` and a player's Mastered state point at specific questions. Re-ingestion would
need a stable identity for a question across regenerations of the file, and every candidate key
is unsound: the CSV's `n` column is a position, not an identifier — reorder the sheet and row
743 becomes a different question with players' history still attached to it.

## Considered Options

**Keying questions on a hash of the question text** — makes re-ingestion idempotent and history
survives edits to answers and explanations. Rejected as unnecessary machinery: it buys a
re-ingestion workflow nobody needs once the bank is loaded, and it silently retires a question
whenever a typo in its text is fixed.

**Keeping the CSV as the source and keying on the `n` column** — trivial to implement and
irreversibly wrong the first time the sheet is reordered.

## Consequences

- There is no versioned file in git describing the live bank. Whatever is in the database is the
  only record of what is being served. (This consequence originally also said the seed CSV would
  not be committed, which left no path for the initial load to run in production — superseded by
  ADR 0011, which commits it under `backend/data/` for that first load only.)
- Until an admin panel exists, correcting a question means a query against production. This is
  the accepted cost, and the admin panel is tracked as its own piece of work.
- Questions are deactivated, never deleted, so answers already given stay readable.
