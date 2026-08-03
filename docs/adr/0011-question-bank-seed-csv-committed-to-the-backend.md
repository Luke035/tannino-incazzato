# The Question Bank seed CSV is committed under `backend/data/`

`question_bank.csv` lives at `backend/data/question_bank.csv`, is committed to the
repository, and is loaded by `scripts/seed_questions.py` from `entrypoint.sh` on container boot.
The script is **seed-once**: if the `question` table already holds a row it reports and exits
without touching anything, so booting the container repeatedly is safe.

ADR 0009 established that the database is the source of truth for the bank and noted, as a
consequence, that the seed CSV would not be committed. That left no path by which the initial
load could ever run in production — an omission the parent spec flagged explicitly rather than
one discovered late. This ADR settles it and supersedes that one consequence of ADR 0009. The
rest of ADR 0009 stands unchanged: the CSV seeds the bank once and is then done, corrections are
made in the database, and the file is never re-ingested over live data.

The location follows ADR 0003. Docker build contexts are directory-scoped, so the backend image
can only `COPY` files from within `backend/`; `backend/data/` is where an ingestion source has to
sit for the image that consumes it.

## Considered Options

**A one-off manual load** — an operator copies the CSV into the running container once per
environment and runs the script by hand. Honours ADR 0009 as written and keeps 450 KB of data out
of git, but production serves an empty bank until a human intervenes, and every fresh
environment — a rebuilt staging, a restored database — silently starts empty again. The failure
mode is a game that loads and shows nothing, which is exactly what the acceptance criterion
"the initial-load path works in production" rules out.

**A mounted file supplied by the deployment platform** — the CSV is mounted into the container
and seeded from when present. Keeps the file out of git, but moves a piece of application data
into deployment configuration that lives outside the codebase, has to be kept in sync by hand,
and is invisible to anyone reading the repository. It buys nothing over committing the file for a
private repository.

## Consequences

- The repository carries the bank. This is acceptable because the repository is private; if it
  is ever opened up, the file's licensing has to be settled before that happens.
- The shape of the bank is testable: `backend/tests/test_seed_questions.py` parses the committed
  CSV and asserts the totals (1851 questions; 722 / 676 / 453 by format; 878 / 701 / 272 by
  level), so a corrupted or truncated sheet fails the suite rather than production.
- The CSV is the record of the *initial* load only. Once seeded, the database diverges from it by
  design and the file must not be treated as describing what is being served.
- Two known defects in the sheet are loaded as they are rather than fixed on the way in, and are
  to be corrected in the database: eight multiple-choice questions carry fewer than three options
  (seven have two, one has a single one), and that last one is an open question mislabelled as
  multiple choice, whose only option repeats its answer in full.
- `start.sh` and `backend/entrypoint.sh` both run the seed step after migrations, so a local
  stack and a deployed one load the bank the same way.
- "Is the bank loaded?" and "load it" are one atomic step, held by a Postgres advisory lock
  (`pg_advisory_xact_lock`). Without it two containers booting together both read an empty table
  and both insert, silently doubling the bank — there is no unique constraint that would catch
  it afterwards, and nothing in the logs that would show it. This is not hypothetical: it was
  reproduced against a real Postgres before the lock was added, and four concurrent seeds now
  produce exactly 1851 rows.
- The script never creates the table itself. It relies on `alembic upgrade head` having run
  first, and fails loudly against an unmigrated database rather than creating a `question` table
  outside Alembic's version tracking. Under `entrypoint.sh`'s `set -e` that surfaces as the
  crash-restart loop ADR 0005 already describes.
