"""Unit tests for backend/scripts/backfill_question_classification.py.

Exercises `backfill()` directly against the SQLite `session` fixture from
conftest.py, the same session the FastAPI test client uses elsewhere in this
suite — `main()` itself only adds engine creation and the Postgres advisory
lock, neither of which is meaningful to unit-test against SQLite.
"""
import sys
from pathlib import Path

from sqlmodel import Session, select

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from backfill_question_classification import backfill  # noqa: E402

from app.questions.model import FORMAT_OPEN, FORMAT_TRUE_FALSE, Question


def _add(session: Session, **overrides) -> Question:
    defaults = dict(
        text="Domanda di prova?",
        format=FORMAT_TRUE_FALSE,
        level=1,
        reference_answer="VERO",
        options=[],
    )
    defaults.update(overrides)
    question = Question(**defaults)
    session.add(question)
    session.commit()
    session.refresh(question)
    return question


def test_backfill_fills_a_missing_topic(session: Session):
    question = _add(session, text="Domanda TF?", topic=None)
    classification = {"Domanda TF?": ("legislation", None)}

    filled, unmatched = backfill(session, classification)

    session.refresh(question)
    assert filled == 1
    assert unmatched == 0
    assert question.topic == "legislation"


def test_backfill_fills_open_subtype_only_for_open_questions(session: Session):
    open_q = _add(
        session,
        text="Example question 1?",
        format=FORMAT_OPEN,
        reference_answer="Soave Piave",
        topic=None,
        open_subtype=None,
    )
    classification = {"Example question 1?": ("italian_regions", "list")}

    filled, unmatched = backfill(session, classification)

    session.refresh(open_q)
    assert filled == 1
    assert open_q.topic == "italian_regions"
    assert open_q.open_subtype == "list"


def test_backfill_never_overwrites_an_existing_value(session: Session):
    """The database is the source of truth once seeded (ADR 0009) — a
    correction made there must survive a backfill run untouched."""
    question = _add(session, text="Domanda TF?", topic="service")
    classification = {"Domanda TF?": ("legislation", None)}

    filled, unmatched = backfill(session, classification)

    session.refresh(question)
    assert question.topic == "service"
    # Nothing changed on this row, and it did not carry a missing
    # open_subtype either (non-open), so it was never a candidate at all.
    assert filled == 0
    assert unmatched == 0


def test_backfill_leaves_unmatched_questions_untouched(session: Session):
    question = _add(session, text="Domanda senza corrispondenza?", topic=None)

    filled, unmatched = backfill(session, classification={})

    session.refresh(question)
    assert question.topic is None
    assert filled == 0
    assert unmatched == 1


def test_backfill_is_idempotent(session: Session):
    _add(session, text="Domanda TF?", topic=None)
    classification = {"Domanda TF?": ("legislation", None)}

    first_filled, _ = backfill(session, classification)
    second_filled, second_unmatched = backfill(session, classification)

    assert first_filled == 1
    # Second pass finds nothing left to do — the row is no longer a
    # candidate at all, so it is neither filled nor reported as unmatched.
    assert second_filled == 0
    assert second_unmatched == 0


def test_backfill_only_touches_rows_missing_a_classification(session: Session):
    already_classified = _add(session, text="Già classificata?", topic="tasting")
    needs_it = _add(session, text="Da classificare?", topic=None)
    classification = {
        "Già classificata?": ("legislation", None),
        "Da classificare?": ("legislation", None),
    }

    filled, unmatched = backfill(session, classification)

    assert filled == 1
    assert unmatched == 0
    rows = {q.text: q.topic for q in session.exec(select(Question)).all()}
    assert rows["Già classificata?"] == "tasting"
    assert rows["Da classificare?"] == "legislation"
