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
        question_text="[question n=425 removed]",
        field="reference_answer",
        old="Nessuna",
        new="1 - Cirò Classico.",
    ),
    # Once the answer is an enumeration rather than "Nessuna", `list` is the
    # criterion the grading agent should apply, not `conceptual`.
    FieldCorrection(
        question_text="[question n=425 removed]",
        field="open_subtype",
        old=SUBTYPE_CONCEPTUAL,
        new=SUBTYPE_LIST,
    ),
    # --- The federdoc sweep (issue #35, docs/question-bank-federdoc-sweep.md) ---
    # Every entry below rests on the January 2026 federdoc snapshot
    # (data/federdoc_snapshot.json), which can adjudicate only whether an Italian
    # denomination exists, what it is called, which region it belongs to, and
    # whether it is DOC or DOCG. Grape, ageing, sub-zone, IGT and non-Italian
    # facts are outside its authority and no question turning on them is touched.
    # Each entry cites the snapshot region and entry it rests on. The full
    # candidate list and the recorded verdict for every candidate — unchanged,
    # corrected, deactivated, or outside the snapshot's authority — are committed
    # alongside as data/denomination_sweep_candidates.csv and
    # data/denomination_sweep_verdicts.csv.

    # n=1 "Example question 1?" — the stored enumeration lists "Colli di
    # Conegliano" (Veneto DOCG, not DOC) *twice*, so it is both a wrong tier and
    # a duplicate. Snapshot region Veneto lists "Colli di Conegliano" among its
    # DOCG and "Bardolino" among its DOC. Both DOCG occurrences are removed and
    # one real Veneto DOC (Bardolino) substituted, keeping the answer at ten
    # DOCs. The "Custozza" spelling is left untouched — the snapshot lists
    # "Bianco di Custoza o Custoza", but a spelling is outside its authority.
    FieldCorrection(
        question_text="Example question 1?",
        field="reference_answer",
        old="[question text removed]",
        new="[answer text removed]",
    ),
    # n=285 "[question text removed]" — the stored answer names
    # "Albana di Romagna", the denomination's former name. Snapshot region
    # Emilia Romagna lists it under its current name "Romagna Albana" (DOCG).
    # Only the name is corrected; the "Giminiano" misspelling of "Gimignano" is
    # left as it stands, being outside the snapshot's authority.
    FieldCorrection(
        question_text="[question n=285 removed]",
        field="reference_answer",
        old="[question text removed]",
        new="[answer text removed]",
    ),
    # n=713 "[question text removed]" — a True/False question
    # whose stored answer is VERO. Snapshot region Marche lists "Cònero" as its
    # DOCG; "Rosso Cònero" is a DOC, not a DOCG. The statement is therefore
    # false, and flipping the single stored word to FALSO makes it correct — the
    # same shape as the T/F flip #34 anticipated. No text change is needed.
    FieldCorrection(
        question_text="[question n=713 removed]",
        field="reference_answer",
        old="VERO",
        new="FALSO",
    ),
    # The stored explanation ("Si, DOCG dal 2004.") asserted the very tier the
    # answer now denies, so it is corrected in the same pass to match the
    # snapshot: the Marche DOCG is "Cònero", and "Rosso Cònero" is a DOC.
    FieldCorrection(
        question_text="[question n=713 removed]",
        field="explanation",
        old="Si, DOCG dal 2004.",
        new="No: la DOCG marchigiana è il Cònero; il Rosso Cònero è una DOC.",
    ),
    # n=1791 "[question text removed]" — a multiple-choice question
    # whose stored answer is "Due". Snapshot region Abruzzo lists three DOCG:
    # Casauria, Montepulciano d’Abruzzo Colline Teramane, and Terre Tollesi o
    # Tullum. The correct count is three, and "Tre" is one of the served options,
    # so the answer key is corrected to it — no change to `options` is needed,
    # which is what keeps this a correction rather than a deactivation.
    FieldCorrection(
        question_text="[question n=1791 removed]",
        field="reference_answer",
        old="Due",
        new="Tre",
    ),
    # The stored explanation named only two of the three DOCG, so it is corrected
    # in the same pass to name all three from snapshot region Abruzzo: Casauria,
    # Montepulciano d'Abruzzo Colline Teramane, and Terre Tollesi o Tullum.
    FieldCorrection(
        question_text="[question n=1791 removed]",
        field="explanation",
        old="[question text removed]",
        new="In Abruzzo sono presenti 3 DOCG: Casauria, Montepulciano d'Abruzzo Colline Teramane e Terre Tollesi o Tullum.",
    ),
]
