"""Sessions and answers of Promossi o Cirrotici.

These live in their own tables (ADR 0008): `game_sessions` models a *finished*
run of Mappa dei Vini, with a score that is NOT NULL and consumers that assume
every row is complete. A quiz Session exists from the moment it is drawn, long
before it has a score, so it is a different entity wearing the same name.
"""
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy import JSON as SAJSON
from sqlmodel import Field, SQLModel

from app.questions.model import FORMAT_MULTIPLE_CHOICE, FORMAT_TRUE_FALSE

# Modes of the game. Only the Exam exists so far; Practice and Error Review are
# stored against the same tables when they arrive, which is why the column is
# written now rather than retrofitted.
MODE_EXAM = "exam"

STATUS_IN_PROGRESS = "in_progress"
STATUS_SUBMITTED = "submitted"

VERDICT_CORRECT = "correct"
VERDICT_WRONG = "wrong"

# Length and pass mark are final: 30 questions, passed at 18 of them.
EXAM_LENGTH = 30
PASS_MARK_PCT = 60

# **Temporary composition — Closed Questions only.** The final Exam is 14 open,
# 11 multiple choice and 5 true/false; the Open Questions arrive with the
# grading agent. Until then the paper keeps its final length and its final
# 11:5 ratio between the closed formats, scaled to fill all 30 questions, so
# that the pass mark still lands on a whole question (18 of 30 is exactly 60%).
EXAM_COMPOSITION = {
    FORMAT_MULTIPLE_CHOICE: 21,
    FORMAT_TRUE_FALSE: 9,
}

# The two answers a true/false question accepts, in the bank's own vocabulary.
# The player answers in these terms and the screen localizes the labels, so the
# stored answer never depends on the language the exam was sat in.
TRUE_FALSE_OPTIONS = ["VERO", "FALSO"]


class ExamSession(SQLModel, table=True):
    """One sitting of the game. Persisted at creation (ADR 0007) so that an
    interrupted Exam is still there when the player comes back."""

    __tablename__ = "exam_sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
        )
    )
    mode: str = Field(default=MODE_EXAM)
    level: Optional[int] = Field(default=None)  # the chosen Level, Practice only
    status: str = Field(default=STATUS_IN_PROGRESS, index=True)
    score: Optional[int] = Field(default=None)
    max_score: int
    duration_seconds: Optional[int] = Field(default=None)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    submitted_at: Optional[datetime] = Field(default=None)


class ExamAnswer(SQLModel, table=True):
    """One question as it was served to one player, with whatever they made of
    it. One row per question drawn — including the ones left blank, which is
    what lets an unanswered question be graded wrong rather than forgotten."""

    __tablename__ = "exam_answers"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("exam_sessions.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )
    )
    question_id: int = Field(
        sa_column=Column(Integer, ForeignKey("question.id"), index=True, nullable=False)
    )
    position: int  # order on the paper, 0-based
    # The option order this player was shown. Persisted so that a resumed Exam
    # is the same paper rather than a reshuffled one.
    served_options: List[str] = Field(
        default_factory=list, sa_column=Column(SAJSON, nullable=False)
    )
    answer: Optional[str] = Field(default=None)
    verdict: Optional[str] = Field(default=None)
    # What the player was told about their answer. Empty for Closed Questions,
    # which need no prose; filled by the grading agent for Open Questions.
    explanation: Optional[str] = Field(default=None)
