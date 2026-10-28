"""Behavioural tests for backend/scripts/apply_corrections.py.

Exercises `apply_corrections()` against the SQLite `session` fixture — `main()`
only adds engine creation and the Postgres advisory lock, neither meaningful to
unit-test on SQLite (same split as test_backfill_question_classification.py).
"""
import sys
from pathlib import Path

from sqlmodel import Session

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from apply_corrections import apply_corrections  # noqa: E402

from app.questions.corrections import (  # noqa: E402
    CORRECTIONS,
    Deactivation,
    FieldCorrection,
)
from app.questions.model import (  # noqa: E402
    FORMAT_OPEN,
    FORMAT_TRUE_FALSE,
    SUBTYPE_CONCEPTUAL,
    SUBTYPE_LIST,
    Question,
)


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


def test_applies_a_field_correction_when_old_value_matches(session: Session):
    q = _add(session, text="Calabria?", reference_answer="Nessuna")
    correction = FieldCorrection("Calabria?", "reference_answer", "Nessuna", "Cirò.")

    report = apply_corrections(session, [correction])

    session.refresh(q)
    assert q.reference_answer == "Cirò."
    assert report.applied == 1
    assert report.skipped == []


def test_skips_when_database_no_longer_holds_the_expected_old_value(session: Session):
    """A correction already made by hand against production must not be
    clobbered (ADR 0012)."""
    q = _add(session, text="Calabria?", reference_answer="Something else entirely")
    correction = FieldCorrection("Calabria?", "reference_answer", "Nessuna", "Cirò.")

    report = apply_corrections(session, [correction])

    session.refresh(q)
    assert q.reference_answer == "Something else entirely"
    assert report.applied == 0
    assert len(report.skipped) == 1


def test_is_a_no_op_on_a_second_run(session: Session):
    q = _add(session, text="Calabria?", reference_answer="Nessuna")
    correction = FieldCorrection("Calabria?", "reference_answer", "Nessuna", "Cirò.")

    first = apply_corrections(session, [correction])
    second = apply_corrections(session, [correction])

    session.refresh(q)
    assert first.applied == 1
    assert second.applied == 0
    assert second.skipped == []
    assert q.reference_answer == "Cirò."


def test_already_at_target_value_is_a_no_op_not_a_skip(session: Session):
    """A correction whose new value the database already holds — applied on an
    earlier boot or by hand — counts as neither applied nor skipped."""
    _add(session, text="Calabria?", reference_answer="Cirò.")
    correction = FieldCorrection("Calabria?", "reference_answer", "Nessuna", "Cirò.")

    report = apply_corrections(session, [correction])

    assert report.applied == 0
    assert report.skipped == []


def test_unmatched_question_is_reported_not_applied(session: Session):
    correction = FieldCorrection("Nonexistent?", "reference_answer", "a", "b")

    report = apply_corrections(session, [correction])

    assert report.applied == 0
    assert report.unmatched == ["Nonexistent?"]


def test_chain_of_corrections_applies_in_order(session: Session):
    """A later entry builds on the value an earlier one wrote in the same run
    — the reversal chain (ADR 0012)."""
    q = _add(session, text="Calabria?", reference_answer="Nessuna")
    corrections = [
        FieldCorrection("Calabria?", "reference_answer", "Nessuna", "Cirò."),
        FieldCorrection("Calabria?", "reference_answer", "Cirò.", "Nessuna"),
    ]

    report = apply_corrections(session, corrections)

    session.refresh(q)
    assert q.reference_answer == "Nessuna"
    assert report.applied == 2


def test_open_subtype_correction(session: Session):
    q = _add(
        session,
        text="Calabria?",
        format=FORMAT_OPEN,
        reference_answer="Cirò.",
        open_subtype=SUBTYPE_CONCEPTUAL,
    )
    correction = FieldCorrection(
        "Calabria?", "open_subtype", SUBTYPE_CONCEPTUAL, SUBTYPE_LIST
    )

    apply_corrections(session, [correction])

    session.refresh(q)
    assert q.open_subtype == SUBTYPE_LIST


def test_deactivation_sets_active_false(session: Session):
    q = _add(session, text="Retire me?", active=True)

    report = apply_corrections(session, [Deactivation("Retire me?")])

    session.refresh(q)
    assert q.active is False
    assert report.applied == 1


def test_deactivation_is_idempotent(session: Session):
    q = _add(session, text="Retire me?", active=True)

    first = apply_corrections(session, [Deactivation("Retire me?")])
    second = apply_corrections(session, [Deactivation("Retire me?")])

    session.refresh(q)
    assert q.active is False
    assert first.applied == 1
    assert second.applied == 0


def test_open_subtype_correction_refused_on_a_non_open_question(session: Session):
    """The writer, not only the data-integrity test, refuses to stamp an
    open_subtype onto a closed question (ADR 0012)."""
    q = _add(
        session,
        text="Calabria?",
        format=FORMAT_TRUE_FALSE,
        open_subtype=SUBTYPE_CONCEPTUAL,
    )
    correction = FieldCorrection(
        "Calabria?", "open_subtype", SUBTYPE_CONCEPTUAL, SUBTYPE_LIST
    )

    report = apply_corrections(session, [correction])

    session.refresh(q)
    assert q.open_subtype == SUBTYPE_CONCEPTUAL
    assert report.applied == 0
    assert len(report.skipped) == 1


def test_real_corrections_fix_the_calabria_question_end_to_end(session: Session):
    """The acceptance behaviour: booting the real CORRECTIONS against a row
    seeded before this change (answer "Nessuna", subtype "conceptual") serves
    the corrected answer and moves grading to the `list` criterion. Applying
    them a second time is a no-op."""
    calabria = _add(
        session,
        text="[question n=425 removed]",
        format=FORMAT_OPEN,
        level=2,
        reference_answer="Nessuna",
        topic="italian_regions",
        open_subtype=SUBTYPE_CONCEPTUAL,
    )

    first = apply_corrections(session, CORRECTIONS)
    second = apply_corrections(session, CORRECTIONS)

    session.refresh(calabria)
    assert calabria.reference_answer == "1 - Cirò Classico."
    assert calabria.open_subtype == SUBTYPE_LIST
    assert first.applied == 2
    assert second.applied == 0
    assert second.skipped == []
