"""
Usage: uv run python scripts/apply_corrections.py

Applies the Question Bank corrections file (app/questions/corrections.py) to
the database, once per boot, right after seed_questions.py and
backfill_question_classification.py.

Each field correction writes only where the database still holds the expected
old value, so a correction already made by hand against production is never
clobbered and a second run is a no-op (ADR 0012). Matching is by question text,
the only stable key (ADR 0009). Runs on any database — freshly seeded or long
in production — and holds its own Postgres advisory lock, distinct from the
seed and backfill keys.
"""
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

# Allow running from any working directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.database import get_engine  # noqa: E402
from app.questions.corrections import (  # noqa: E402
    CORRECTIONS,
    Correction,
    Deactivation,
    FieldCorrection,
)
from app.questions.model import FORMAT_OPEN, Question  # noqa: E402

# Arbitrary constant identifying this operation to Postgres, distinct from the
# seed and backfill keys so the three, which run back to back in one boot,
# never contend for the same lock while guarding unrelated invariants.
# "QUCO" — QUestion COrrections.
CORRECTIONS_LOCK_KEY = 0x5155434F


@dataclass
class Report:
    applied: int = 0
    skipped: List[str] = field(default_factory=list)
    unmatched: List[str] = field(default_factory=list)


def _apply_field_correction(
    question: Question, correction: FieldCorrection, report: Report
) -> None:
    if correction.field == "open_subtype" and question.format != FORMAT_OPEN:
        # open_subtype is grading metadata for Open Questions only (ADR 0012).
        # The data-integrity test rejects such a correction, so this guards a
        # case that should never reach here — but the writer refuses it rather
        # than quietly stamping a subtype onto a closed question.
        report.skipped.append(
            f"{correction.question_text!r}.open_subtype: not an Open Question "
            f"({question.format!r}); left untouched"
        )
        return

    current = getattr(question, correction.field)
    if current == correction.new:
        # Already at the target value — the correction was applied on an
        # earlier boot, or by hand against production. Nothing to do.
        return
    if current != correction.old:
        report.skipped.append(
            f"{correction.question_text!r}.{correction.field}: expected old "
            f"value {correction.old!r} but database holds {current!r}; left "
            "untouched"
        )
        return
    setattr(question, correction.field, correction.new)
    report.applied += 1


def _apply_deactivation(question: Question, report: Report) -> None:
    if not question.active:
        return
    question.active = False
    report.applied += 1


def apply_corrections(
    session: Session, corrections: List[Correction]
) -> Report:
    """Apply every correction in order. Returns a Report of what happened.

    Corrections are applied in file order so a later entry can build on the
    value an earlier one wrote in this same run (the reversal chain, ADR 0012).
    """
    report = Report()
    for correction in corrections:
        question = session.exec(
            select(Question).where(Question.text == correction.question_text)
        ).first()
        if question is None:
            report.unmatched.append(correction.question_text)
            continue

        if isinstance(correction, FieldCorrection):
            _apply_field_correction(question, correction, report)
        elif isinstance(correction, Deactivation):
            _apply_deactivation(question, report)
        else:  # pragma: no cover - exhaustive over the Correction union
            raise TypeError(f"unknown correction type: {type(correction)!r}")

        session.add(question)

    session.commit()
    return report


def main() -> None:
    engine = get_engine()
    with Session(engine) as session:
        # Same reasoning as seed_questions.py and the backfill: reading the
        # current value and writing the corrected one must be one atomic step,
        # so two containers booting together cannot interleave a read and a
        # write and each apply the same correction, or race on the
        # expected-old-value guard.
        if session.get_bind().dialect.name == "postgresql":
            session.execute(
                text("SELECT pg_advisory_xact_lock(:key)"),
                {"key": CORRECTIONS_LOCK_KEY},
            )

        report = apply_corrections(session, CORRECTIONS)

    print(f"Applied {report.applied} correction(s).")
    for note in report.skipped:
        print(f"  skipped: {note}")
    for question_text in report.unmatched:
        print(f"  unmatched: {question_text!r} not found in the bank; skipped")


if __name__ == "__main__":
    main()
