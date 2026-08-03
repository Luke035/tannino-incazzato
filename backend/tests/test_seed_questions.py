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


def test_every_question_starts_active(bank: list[Question]):
    assert all(q.active for q in bank)


# ── topic / open_subtype columns (docs/question-bank-classification.md) ───────
#
# These exercise `parse_questions` against a small fixture of our own rather
# than the committed CSV: the committed-CSV data-integrity check (with real
# taxonomy/coverage assertions) lives in test_question_bank_classification.py,
# and is expected to fail until backend/scripts/merge_classification.py has
# actually been run over the real sheet.

FIXTURE_HEADER = "n,formato,tipo_codice,domanda,opzione_1,opzione_2,opzione_3,risposta_corretta,spiegazione"


def _write_fixture_csv(tmp_path, rows: list[str], header: str = FIXTURE_HEADER):
    path = tmp_path / "fixture.csv"
    path.write_text("\n".join([header, *rows]) + "\n", encoding="utf-8")
    return path


def test_topic_and_open_subtype_are_read_when_the_sheet_supplies_them(tmp_path):
    csv_path = _write_fixture_csv(
        tmp_path,
        [
            "1,Vero/Falso,1,Il Bicchiere ISO è normato?,,,,VERO,spiegazione,legislation,",
            "2,Aperta,2,Example question 1?,,,,Soave Piave,spiegazione,italian_regions,list",
        ],
        header=(
            "n,formato,tipo_codice,domanda,opzione_1,opzione_2,opzione_3,"
            "risposta_corretta,spiegazione,topic,open_subtype"
        ),
    )

    bank = parse_questions(csv_path)

    assert bank[0].topic == "legislation"
    assert bank[0].open_subtype is None
    assert bank[1].topic == "italian_regions"
    assert bank[1].open_subtype == "list"


def test_topic_and_open_subtype_are_absent_when_the_sheet_predates_the_merge(tmp_path):
    """A sheet without the two columns still loads — their absence must not
    block the load (docs/question-bank-classification.md)."""
    csv_path = _write_fixture_csv(
        tmp_path,
        ['1,Vero/Falso,1,Il Bicchiere ISO è normato?,,,,VERO,spiegazione'],
    )

    bank = parse_questions(csv_path)

    assert bank[0].topic is None
    assert bank[0].open_subtype is None
