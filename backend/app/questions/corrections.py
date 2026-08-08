"""The Question Bank corrections file.

A correction is a delta on top of the seed CSV (ADR 0009, ADR 0011): the seed
CSV is never edited again, and the database is the source of truth once seeded.
`seed_questions.py` no-ops the moment the table holds a row, so a correction to
an already-seeded database has nowhere else to land — this file, applied on
every boot by `scripts/apply_corrections.py`, is that place
(docs/adr/0012-question-bank-corrections.md).

The file is **append-only**. Reversing an applied correction means appending a
new entry whose `old` is what the previous entry wrote — never editing or
deleting an existing entry. The key is always the question text, the only
stable key available (ADR 0009).

A correction may change `reference_answer`, `explanation` or `open_subtype`
only. A question that would need its `text` or `options` changed is
**deactivated** instead: changing options would leave `exam_answers.
served_options` describing a paper that no longer exists, and changing the text
would destroy the correction's own key.
"""
from dataclasses import dataclass
from typing import List, Optional, Union

from app.questions.model import SUBTYPE_CONCEPTUAL, SUBTYPE_LIST

# The only fields a FieldCorrection may touch. `text` and `options` are absent
# by design — see the module docstring and the ADR.
CORRECTABLE_FIELDS = ("reference_answer", "explanation", "open_subtype")

# The only values open_subtype may be corrected to. A FieldCorrection on
# open_subtype whose `new` is outside this set is rejected by the data-integrity
# test, and open_subtype may only be set on an Open Question.
VALID_SUBTYPES = (SUBTYPE_CONCEPTUAL, SUBTYPE_LIST)


@dataclass(frozen=True)
class FieldCorrection:
    """Change one field of one question, but only if it still holds `old`.

    `old` is the value the database is expected to hold — either what the seed
    CSV loaded, or what a previous entry in this file wrote. Writing only when
    the database still holds `old` is what makes a correction already made by
    hand against production a no-op rather than a clobber, and what makes a
    second run of the apply script a no-op.
    """

    question_text: str
    field: str
    old: Optional[str]
    new: Optional[str]


@dataclass(frozen=True)
class Deactivation:
    """Set `active = false` on one question.

    The escape hatch for a question that would otherwise need its `text` or
    `options` changed. Idempotent: applying it to an already-inactive question
    is a no-op.
    """

    question_text: str


Correction = Union[FieldCorrection, Deactivation]


# The corrections, in the order they must be applied. Append-only: add new
# entries at the end, never edit or remove an existing one.
CORRECTIONS: List[Correction] = [
    # n=425 "[question text removed]" — the seed sheet
    # answered "Nessuna", but federdoc's January 2026 snapshot lists Cirò
    # Classico as Calabria's sole D.O.C.G. (data/federdoc_snapshot.json). The
    # answer follows the house "quante e quali" style already set by n=424.
    FieldCorrection(
        question_text="[question text removed]",
        field="reference_answer",
        old="Nessuna",
        new="1 - Cirò Classico.",
    ),
    # Once the answer is an enumeration rather than "Nessuna", `list` is the
    # criterion the grading agent should apply, not `conceptual`.
    FieldCorrection(
        question_text="[question text removed]",
        field="open_subtype",
        old=SUBTYPE_CONCEPTUAL,
        new=SUBTYPE_LIST,
    ),
]
