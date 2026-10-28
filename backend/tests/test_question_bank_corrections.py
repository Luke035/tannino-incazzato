"""Data-integrity tests for the Question Bank corrections file.

These assert on the committed corrections list (app/questions/corrections.py)
against the committed seed CSV — the seed CSV is never edited again, so every
correction's expected old value can be checked against what the sheet loaded,
or against what a previous entry in the chain wrote (ADR 0012).

No database is involved: this is a pure consistency check on two committed
files, run in CI so a malformed correction can never reach a boot.
"""
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

import pytest

from app.questions.corrections import (
    CORRECTABLE_FIELDS,
    CORRECTIONS,
    VALID_SUBTYPES,
    Deactivation,
    FieldCorrection,
)
from app.questions.model import FORMAT_OPEN, Question
from app.questions.seed import parse_questions

SEED_CSV = Path(__file__).parent.parent / "data" / "question_bank.csv"


@pytest.fixture(scope="module")
def bank_by_text() -> Dict[str, Question]:
    if not SEED_CSV.exists():
        pytest.skip("question bank CSV is not included in the public repository")
    return {q.text: q for q in parse_questions(SEED_CSV)}


def _seed_field_value(question: Question, field: str):
    return getattr(question, field)


def test_every_correction_targets_a_question_in_the_seed_csv(bank_by_text):
    for correction in CORRECTIONS:
        assert correction.question_text in bank_by_text, (
            f"correction targets {correction.question_text!r}, which is not in "
            "the seed CSV"
        )


def test_field_corrections_touch_only_allowed_fields():
    for correction in CORRECTIONS:
        if isinstance(correction, FieldCorrection):
            assert correction.field in CORRECTABLE_FIELDS, (
                f"{correction.field!r} is not correctable; a change to text or "
                "options must be a Deactivation instead (ADR 0012)"
            )


def test_field_corrections_change_the_value():
    for correction in CORRECTIONS:
        if isinstance(correction, FieldCorrection):
            assert correction.old != correction.new, (
                f"correction on {correction.question_text!r}.{correction.field} "
                "is a no-op: old and new are equal"
            )


def test_corrected_open_subtype_is_valid_and_only_on_open_questions(bank_by_text):
    for correction in CORRECTIONS:
        if isinstance(correction, FieldCorrection) and correction.field == "open_subtype":
            assert correction.new in VALID_SUBTYPES, (
                f"open_subtype corrected to {correction.new!r}, not one of "
                f"{VALID_SUBTYPES}"
            )
            question = bank_by_text[correction.question_text]
            assert question.format == FORMAT_OPEN, (
                f"open_subtype may only be set on an Open Question; "
                f"{correction.question_text!r} is {question.format!r}"
            )


def test_expected_old_value_matches_the_csv_or_a_previous_entry(bank_by_text):
    """For each question, the chain of corrections must be unbroken: the first
    entry's `old` is what the CSV holds; each subsequent entry's `old` is what
    the previous entry touching that question wrote (ADR 0012)."""
    # Per-question, per-field, the last value written (starting from the CSV).
    last_written: Dict[str, Dict[str, object]] = defaultdict(dict)

    for correction in CORRECTIONS:
        if not isinstance(correction, FieldCorrection):
            continue
        text = correction.question_text
        field = correction.field
        if field in last_written[text]:
            expected = last_written[text][field]
            source = "the previous entry in the chain"
        else:
            expected = _seed_field_value(bank_by_text[text], field)
            source = "the seed CSV"
        assert correction.old == expected, (
            f"correction on {text!r}.{field} expects old value "
            f"{correction.old!r}, but {source} holds {expected!r}; the chain "
            "is broken"
        )
        last_written[text][field] = correction.new


def test_calabria_docg_correction_is_present_and_literal(bank_by_text):
    """The one correction this slice lands, pinned to its exact values."""
    calabria = [
        c
        for c in CORRECTIONS
        if isinstance(c, FieldCorrection)
        and c.question_text == "[question n=425 removed]"
    ]
    fields = {c.field: c for c in calabria}
    assert set(fields) == {"reference_answer", "open_subtype"}
    assert fields["reference_answer"].old == "Nessuna"
    assert fields["reference_answer"].new == "1 - Cirò Classico."
    assert fields["open_subtype"].old == "conceptual"
    assert fields["open_subtype"].new == "list"
