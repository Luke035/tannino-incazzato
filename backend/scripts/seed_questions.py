"""
Usage: uv run python scripts/seed_questions.py <path-to-questions.csv>

Loads the Question Bank into the `question` table, once.

Unlike `ingest_denominations.py`, this is NOT a re-runnable ingestion: the
database is the source of truth for the bank (ADR 0009), and answers already
given point at specific questions. If the table already holds questions the
script reports and exits without touching anything, so it is safe to run on
every container boot.

The table itself is created by Alembic, never here: `entrypoint.sh` and
`start.sh` both run `alembic upgrade head` first. Running this script against a
database that has not been migrated fails loudly, which is what we want — the
alternative is a table created outside Alembic's version tracking.
"""
import sys
from pathlib import Path

# Allow running from any working directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.database import get_engine  # noqa: E402
from app.questions.model import Question  # noqa: E402
from app.questions.seed import parse_questions  # noqa: E402

# Arbitrary constant identifying this particular seed operation to Postgres.
SEED_LOCK_KEY = 0x5155495A  # "QUIZ"


def main(csv_path: str) -> None:
    # Parsed before the lock is taken: a malformed sheet should fail without
    # having held up anything.
    questions = parse_questions(csv_path)
    engine = get_engine()

    with Session(engine) as session:
        # "Is it loaded?" and "load it" have to be one atomic step. Without a
        # lock two containers booting together both read an empty table and
        # both insert — silently doubling the bank, with no unique constraint
        # to catch it. The lock is held until this transaction ends.
        if session.get_bind().dialect.name == "postgresql":
            session.execute(
                text("SELECT pg_advisory_xact_lock(:key)"), {"key": SEED_LOCK_KEY}
            )

        already_loaded = session.exec(select(Question).limit(1)).first()
        if already_loaded is not None:
            print("Question bank already seeded — leaving it alone.")
            return

        session.add_all(questions)
        session.commit()

    print(f"Seeded {len(questions)} questions.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: uv run python scripts/seed_questions.py <path-to-questions.csv>")
        sys.exit(1)
    main(sys.argv[1])
