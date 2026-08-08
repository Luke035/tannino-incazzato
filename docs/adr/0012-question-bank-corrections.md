# Question Bank corrections are a committed, append-only delta applied on every boot

A correction to a seeded question — its answer, its explanation, or its grading subtype — lives
in a committed, append-only corrections file (`backend/app/questions/corrections.py`), applied to
the database on every boot by `scripts/apply_corrections.py`, immediately after
`seed_questions.py` and `backfill_question_classification.py`.

ADR 0009 established that the database is the source of truth for the bank, and that correcting a
question means a query against production until an admin panel exists. That leaves a real gap:
`seed_questions.py` no-ops the moment the table holds a row (ADR 0009, ADR 0011), and
`backfill_question_classification.py` only ever fills a NULL. A correction to a value already
present in a seeded database has nowhere to land, and a hand-run production query is neither
reviewable nor reproducible across the many databases the app runs on. This ADR gives corrections
a home in git while keeping the database the source of truth.

## How it works

- **The seed CSV is never edited again.** `backend/data/question_bank.csv` is the sheet as
  received; a correction is a delta on top of it. That is exactly what lets the data-integrity
  test verify each correction's expected old value against the CSV.
- **The key is the question text** — the only stable key available (ADR 0009 explains why the
  CSV's `n` column is not one), and the key `backfill_question_classification.py` already uses.
- **A correction may change `reference_answer`, `explanation` and `open_subtype` only.** A
  question needing its `text` or `options` changed is **deactivated** (`active = false`) instead:
  changing options would leave `exam_answers.served_options` describing a paper that no longer
  exists, and changing the text would destroy the correction's own key. `open_subtype` carries
  neither hazard — it is grading metadata, and it moves whenever an answer stops being a concept
  and becomes an enumeration.
- **The apply script writes only where the database still holds the expected old value.** A
  correction already made by hand against production is therefore never clobbered, and a second
  run is a no-op.
- **The file is append-only.** Reversing an applied correction means appending a new entry whose
  expected old value is what the previous entry wrote. The test verifies the per-question chain is
  unbroken: each entry starts where the last one touching that question ended.
- The apply script holds its own Postgres advisory lock (`0x5155434F`, "QUCO"), distinct from the
  seed (`0x5155495A`) and backfill (`0x51554243`) keys, for the same read-then-write atomicity
  reason those two hold theirs.

The authority a correction cites is a **dated, committed federdoc snapshot**
(`backend/data/federdoc_snapshot.json`), produced offline by `scripts/snapshot_federdoc.py` from
the 25 federdoc regional pages (Piemonte across four, Toscana across two, merged into one region
each). Re-running the snapshot script against unchanged pages produces a byte-identical file: the
date is read from federdoc's own "Dati e mappe aggiornati a …" stamp, not the wall clock.

## The accepted hazard

Closed questions (true/false, multiple choice) are graded **at submit**, not at answer time. A
correction landing between a player's answer and their submit therefore changes that answer's
verdict. It is rare, and the new verdict is the correct one — an answer graded against a value the
snapshot has since shown to be wrong was mis-graded, and the correction fixes it. This ADR records
the hazard as accepted rather than mitigated.

## Considered Options

**A hand-run query against production (the ADR 0009 status quo).** Rejected: not reviewable, not
reproducible across databases, and no protection against fat-fingering a `WHERE` clause. The
corrections file is the same edit, but versioned, tested, and guarded by the expected-old-value
check.

**Re-ingesting a regenerated seed CSV.** Rejected for the reasons ADR 0009 already gives — no
sound stable key survives a regeneration of the sheet.

## Consequences

- This ADR amends ADR 0009: correcting a question no longer means a query against production. It
  means an append to the corrections file, reviewed and merged like any other change.
- The corrections file and the snapshot both live in git, so the delta over the seed CSV is
  auditable even though the live bank itself still has no single versioned description (ADR 0009).
- Corrections are applied on every boot on any database, freshly seeded or years in production,
  and are idempotent.
- The in-flight-verdict hazard above is accepted.
