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

from app.questions.model import FORMAT_MULTIPLE_CHOICE, FORMAT_OPEN, FORMAT_TRUE_FALSE

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

# The composition of the paper. Levels are not part of it: the draw is blind
# and random across the whole active bank, so the three Levels come out in the
# proportion the bank itself holds them — which is what the real sitting does.
EXAM_COMPOSITION = {
    FORMAT_OPEN: 14,
    FORMAT_MULTIPLE_CHOICE: 11,
    FORMAT_TRUE_FALSE: 5,
}

# The two answers a true/false question accepts, in the bank's own vocabulary.
# The player answers in these terms and the screen localizes the labels, so the
# stored answer never depends on the language the exam was sat in.
TRUE_FALSE_OPTIONS = ["VERO", "FALSO"]

# An Open Question is answered in prose, and prose has no natural end. The cap
# is far above any real answer — the longest reference answer in the bank is
# under 2500 characters — and exists so that one pasted essay cannot dominate a
# prompt carrying fourteen questions.
MAX_OPEN_ANSWER_CHARS = 4000


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
    # Null until *every* question carries a Verdict. A paper whose Open
    # Questions could not be marked is submitted but ungraded, and emits no
    # score at all rather than a score that counts the unmarked ones wrong.
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
