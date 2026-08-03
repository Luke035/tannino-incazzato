"""The seed CSV is committed under `backend/data/` (ADR 0011), so the shape of
the bank it produces is testable here rather than only observable in production."""
import collections
from pathlib import Path

import pytest

from app.questions.model import (
    FORMAT_MULTIPLE_CHOICE,
    FORMAT_OPEN,
    FORMAT_TRUE_FALSE,
    Question,
)
from app.questions.seed import parse_questions

SEED_CSV = Path(__file__).parent.parent / "data" / "question_bank.csv"


@pytest.fixture(scope="module")
def bank() -> list[Question]:
    return parse_questions(SEED_CSV)


def test_the_whole_bank_loads(bank: list[Question]):
    assert len(bank) == 1851


def test_bank_format_distribution(bank: list[Question]):
    by_format = collections.Counter(q.format for q in bank)
    assert by_format == {
        FORMAT_TRUE_FALSE: 722,
        FORMAT_MULTIPLE_CHOICE: 676,
        FORMAT_OPEN: 453,
    }


def test_bank_level_distribution(bank: list[Question]):
    by_level = collections.Counter(q.level for q in bank)
    assert by_level == {1: 878, 2: 701, 3: 272}


def test_only_multiple_choice_carries_options(bank: list[Question]):
    for question in bank:
        if question.format == FORMAT_MULTIPLE_CHOICE:
            assert 1 <= len(question.options) <= 3
        else:
            assert question.options == []


def test_eight_multiple_choice_questions_are_short_of_three_options(bank: list[Question]):
    """Seven carry two options and one carries a single one; all eight are
    served as they are."""
    short = [
        q for q in bank if q.format == FORMAT_MULTIPLE_CHOICE and len(q.options) < 3
    ]
    assert len(short) == 8
    assert len([q for q in short if len(q.options) == 2]) == 7


def test_one_multiple_choice_question_is_mislabelled_in_the_source(bank: list[Question]):
    """A known defect in the seed sheet: one open question ("...Quale? Da quale
    vitigno?") is tagged multiple choice and carries a single option repeating
    its answer in full. It is loaded as it is and corrected in the database,
    which is the source of truth once the bank is seeded (ADR 0009)."""
    one_option = [
        q for q in bank if q.format == FORMAT_MULTIPLE_CHOICE and len(q.options) == 1
    ]
    assert len(one_option) == 1
    assert one_option[0].text.startswith("[question text removed]")


def test_every_question_has_a_reference_answer(bank: list[Question]):
    assert all(q.reference_answer for q in bank)


def test_the_correct_answer_is_among_the_multiple_choice_options(bank: list[Question]):
    for question in bank:
        if question.format == FORMAT_MULTIPLE_CHOICE:
            assert question.reference_answer in question.options


def test_topic_and_open_subtype_are_empty_until_issue_14_lands(bank: list[Question]):
    """They are read from the sheet when it supplies them, and their absence
    must not block the load."""
    assert all(q.topic is None for q in bank)
    assert all(q.open_subtype is None for q in bank)


def test_every_question_starts_active(bank: list[Question]):
    assert all(q.active for q in bank)
