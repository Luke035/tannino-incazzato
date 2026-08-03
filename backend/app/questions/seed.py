"""Parsing of the Question Bank seed CSV.

The CSV seeds the `question` table once and is then done — the database is the
source of truth from that point on (ADR 0009, ADR 0011).
"""
import csv
from pathlib import Path
from typing import Iterator, List, Optional

from app.questions.model import (
    FORMAT_MULTIPLE_CHOICE,
    FORMAT_OPEN,
    FORMAT_TRUE_FALSE,
    Question,
)

FORMAT_BY_CSV_LABEL = {
    "Vero/Falso": FORMAT_TRUE_FALSE,
    "Scelta multipla": FORMAT_MULTIPLE_CHOICE,
    "Aperta": FORMAT_OPEN,
}

OPTION_COLUMNS = ("opzione_1", "opzione_2", "opzione_3")

# Classification columns, appended to the sheet by
# backend/scripts/merge_classification.py (docs/question-bank-classification.md).
# Read when present; their absence must not block the load, since a freshly
# checked-out sheet may predate the merge.
TOPIC_COLUMN = "topic"
SUBTYPE_COLUMN = "open_subtype"


def _clean(value: Optional[str]) -> str:
    return (value or "").strip()


def _optional(value: Optional[str]) -> Optional[str]:
    return _clean(value) or None


def parse_questions(csv_path: Path | str) -> List[Question]:
    """Read the seed CSV into unsaved `Question` rows.

    A row that cannot be understood raises rather than being skipped: a bank
    that silently loads 1849 of 1851 questions is worse than one that refuses
    to load at all.
    """
    # utf-8-sig: the exported sheet carries a BOM on its first header
    with open(csv_path, encoding="utf-8-sig", newline="") as handle:
        return list(_rows_to_questions(csv.DictReader(handle)))


def _rows_to_questions(reader: Iterator[dict]) -> Iterator[Question]:
    for line, row in enumerate(reader, start=2):
        label = _clean(row.get("formato"))
        if label not in FORMAT_BY_CSV_LABEL:
            raise ValueError(f"line {line}: unknown question format {label!r}")
        question_format = FORMAT_BY_CSV_LABEL[label]

        try:
            level = int(_clean(row.get("tipo_codice")))
        except ValueError:
            raise ValueError(
                f"line {line}: level is not a number: {row.get('tipo_codice')!r}"
            ) from None
        if level not in (1, 2, 3):
            raise ValueError(f"line {line}: level out of range: {level}")

        text = _clean(row.get("domanda"))
        if not text:
            raise ValueError(f"line {line}: question text is empty")

        reference_answer = _clean(row.get("risposta_corretta"))
        if not reference_answer:
            raise ValueError(f"line {line}: reference answer is empty")

        # Only multiple choice carries options. The bank is loaded as it is:
        # eight questions have two options rather than three, and one (line
        # 1610) is an open question mislabelled as multiple choice, with a
        # single option that repeats the answer in full. Both are data defects
        # to be corrected in the database, which is the source of truth once
        # the bank is seeded — not by rewriting rows on the way in.
        options: List[str] = []
        if question_format == FORMAT_MULTIPLE_CHOICE:
            options = [o for o in (_clean(row.get(c)) for c in OPTION_COLUMNS) if o]
            if not options:
                raise ValueError(f"line {line}: multiple choice with no options")

        yield Question(
            text=text,
            format=question_format,
            level=level,
            reference_answer=reference_answer,
            options=options,
            explanation=_optional(row.get("spiegazione")),
            topic=_optional(row.get(TOPIC_COLUMN)),
            open_subtype=_optional(row.get(SUBTYPE_COLUMN)),
            active=True,
        )
