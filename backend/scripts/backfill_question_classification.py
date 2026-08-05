"""
Usage: uv run python scripts/backfill_question_classification.py <path-to-questions.csv>

Fills in `topic` and `open_subtype` for questions already sitting in the
database, from the classification the seed CSV carries
(docs/question-bank-classification.md).

`seed_questions.py` is seed-once (ADR 0009, ADR 0011): a database that was
seeded before a classification landed — or before a correction to one did —
never receives it, because the seed script no-ops the moment the table holds a
row. This script exists for exactly that gap, and is safe to run on every
boot: it only ever sets a `topic` or `open_subtype` that is currently NULL,
and never overwrites a value already in the database, which is the source of
truth for any correction made there after the fact (ADR 0009).

Matching is by question text — there is no other stable key available once
rows are already committed (ADR 0009 explains why the CSV's `n` column cannot
be used as one).
"""
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Allow running from any working directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.database import get_engine  # noqa: E402
from app.questions.model import FORMAT_OPEN, Question  # noqa: E402
from app.questions.seed import parse_questions  # noqa: E402

# Arbitrary constant identifying this operation to Postgres. Distinct from
# seed_questions.py's SEED_LOCK_KEY: the two run back to back in the same
# boot but guard unrelated invariants, so they hold separate locks.
BACKFILL_LOCK_KEY = 0x51554243  # "QUBC"

Classification = Tuple[Optional[str], Optional[str]]


def _classification_by_text(csv_path: str) -> Dict[str, Classification]:
    """{question text: (topic, open_subtype)} read from the seed CSV.

    A text that repeats with two different classifications would make the
    match ambiguous — fail loudly rather than pick one arbitrarily.
    """
    by_text: Dict[str, Classification] = {}
    conflicts: List[str] = []
    for question in parse_questions(csv_path):
        classification = (question.topic, question.open_subtype)
        if question.text in by_text and by_text[question.text] != classification:
            conflicts.append(question.text)
        by_text[question.text] = classification

    if conflicts:
        raise ValueError(
            "question text repeats with different classifications in the seed "
            f"CSV, backfill would be ambiguous for: {conflicts}"
        )
    return by_text


def backfill(session: Session, classification: Dict[str, Classification]) -> Tuple[int, int]:
    """Fill `topic`/`open_subtype` on rows that are missing one, from
    `classification`. Returns (filled, unmatched). Never overwrites a value
    that is already set — that is the whole point of this script, and is
    what makes it safe to call on every boot and idempotent within one.
    """
    candidates = session.exec(
        select(Question).where(
            (Question.topic.is_(None))
            | ((Question.format == FORMAT_OPEN) & (Question.open_subtype.is_(None)))
        )
    ).all()

    filled = 0
    unmatched = 0
    for question in candidates:
        match = classification.get(question.text)
        if match is None:
            unmatched += 1
            continue

        topic, open_subtype = match
        changed = False
        if question.topic is None and topic is not None:
            question.topic = topic
            changed = True
        if (
            question.format == FORMAT_OPEN
            and question.open_subtype is None
            and open_subtype is not None
        ):
            question.open_subtype = open_subtype
            changed = True

        if changed:
            session.add(question)
            filled += 1

    session.commit()
    return filled, unmatched


def main(csv_path: str) -> None:
    classification = _classification_by_text(csv_path)
    engine = get_engine()

    with Session(engine) as session:
        # "Which rows are missing a classification" and "fill them in" have to
        # be one atomic step, same reasoning as seed_questions.py: each
        # individual row update is idempotent on its own, but without the
        # lock two containers booting together could interleave reads and
        # writes and make the printed counts (and any transient duplicate
        # work) misleading.
        if session.get_bind().dialect.name == "postgresql":
            session.execute(
                text("SELECT pg_advisory_xact_lock(:key)"), {"key": BACKFILL_LOCK_KEY}
            )

        filled, unmatched = backfill(session, classification)

    print(
        f"Backfilled {filled} question(s); {unmatched} candidate(s) had no "
        "matching text in the seed CSV and were left untouched."
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(
            "Usage: uv run python scripts/backfill_question_classification.py "
            "<path-to-questions.csv>"
        )
        sys.exit(1)
    main(sys.argv[1])
