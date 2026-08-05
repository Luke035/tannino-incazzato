"""Data-integrity checks for the topic/open_subtype classification carried by
the committed seed CSV (docs/question-bank-classification.md).

Unlike test_seed_questions.py, which exercises `parse_questions` against small
fixtures of its own, this module asserts on the real, committed sheet: once
`backend/scripts/merge_classification.py` has been run over it, every one of
its 1851 rows must carry a topic from the taxonomy, every Open question must
carry a subtype, and no other question may carry one.

Until that merge has run, the committed sheet has no topic/open_subtype
columns at all and this module's assertions fail — that is expected and
correct, not a bug to work around: it is the signal that the classification
has not landed yet.
"""
import collections
from pathlib import Path

import pytest

from app.questions.model import FORMAT_OPEN, SUBTYPE_CONCEPTUAL, SUBTYPE_LIST, TOPICS, Question
from app.questions.seed import parse_questions

SEED_CSV = Path(__file__).parent.parent / "data" / "question_bank.csv"
VALID_SUBTYPES = {SUBTYPE_CONCEPTUAL, SUBTYPE_LIST}


@pytest.fixture(scope="module")
def bank() -> list[Question]:
    return parse_questions(SEED_CSV)


def test_row_count_is_unchanged_by_the_merge(bank: list[Question]):
    assert len(bank) == 1851


def test_every_question_has_a_topic_in_the_taxonomy(bank: list[Question]):
    missing = [q for q in bank if q.topic is None]
    outside_taxonomy = [q for q in bank if q.topic is not None and q.topic not in TOPICS]

    assert not missing, f"{len(missing)} question(s) have no topic"
    assert not outside_taxonomy, (
        f"{len(outside_taxonomy)} question(s) carry a topic outside the taxonomy: "
        f"{sorted({q.topic for q in outside_taxonomy})}"
    )


def test_every_open_question_has_a_subtype(bank: list[Question]):
    open_questions = [q for q in bank if q.format == FORMAT_OPEN]
    missing = [q for q in open_questions if q.open_subtype is None]
    invalid = [
        q
        for q in open_questions
        if q.open_subtype is not None and q.open_subtype not in VALID_SUBTYPES
    ]

    assert len(open_questions) == 453
    assert not missing, f"{len(missing)} open question(s) have no subtype"
    assert not invalid, f"{len(invalid)} open question(s) carry an invalid subtype"


def test_no_non_open_question_carries_a_subtype(bank: list[Question]):
    offenders = [q for q in bank if q.format != FORMAT_OPEN and q.open_subtype is not None]
    assert not offenders, f"{len(offenders)} non-open question(s) carry an open_subtype"


def test_topic_distribution_covers_the_whole_taxonomy(bank: list[Question]):
    """Not a strict requirement of any one count, just a sanity net: every
    slug in the taxonomy should actually be used somewhere in 1851 questions,
    or it likely does not belong in the taxonomy."""
    by_topic = collections.Counter(q.topic for q in bank if q.topic is not None)
    unused = set(TOPICS) - set(by_topic)
    assert not unused, f"topic(s) never used in the bank: {sorted(unused)}"
