from typing import List, Optional

from sqlalchemy import JSON
from sqlmodel import Column, Field, SQLModel

# Question formats, as they appear in the source bank.
FORMAT_TRUE_FALSE = "true_false"
FORMAT_MULTIPLE_CHOICE = "multiple_choice"
FORMAT_OPEN = "open"

# Open Question subtypes, produced offline (docs/question-bank-classification.md).
SUBTYPE_CONCEPTUAL = "conceptual"
SUBTYPE_LIST = "list"

# Topic taxonomy, produced offline (docs/question-bank-classification.md). Every
# question carries exactly one topic, chosen from this fixed set — the single
# source of truth read by backend/scripts/merge_classification.py and by the
# data-integrity test over the committed seed CSV.
TOPICS = (
    "viticulture",
    "winemaking",
    "sparkling_wines",
    "italian_regions",
    "foreign_regions",
    "tasting",
    "service",
    "food_pairing",
    "spirits",
    "legislation",
)


class Question(SQLModel, table=True):
    """One certified question from the sommelier course bank. The database is
    the source of truth: the seed CSV loads the bank once and corrections are
    made here afterwards. Questions are deactivated, never deleted, so answers
    already given to them stay readable."""

    id: Optional[int] = Field(default=None, primary_key=True)
    text: str
    format: str = Field(index=True)
    level: int = Field(index=True)
    reference_answer: str
    options: List[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    explanation: Optional[str] = Field(default=None)
    topic: Optional[str] = Field(default=None, index=True)
    open_subtype: Optional[str] = Field(default=None)
    active: bool = Field(default=True, index=True)


class QuestionRead(SQLModel):
    """What the browser is allowed to see for a question it has not answered.

    Deliberately omits `reference_answer` and `explanation`: the explanation
    spells the correct answer out in prose, so serving it would defeat the game
    exactly as serving the answer itself would."""

    id: int
    text: str
    format: str
    level: int
    options: List[str]
    topic: Optional[str]
