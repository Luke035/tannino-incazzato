"""Profile statistics for Promossi o Cirrotici (#24).

The week before the exam a student has two questions: am I getting better, and
what should I go and study? This endpoint answers both from the quiz's own
tables and nothing else — `game_sessions` is never read here, so Mappa dei Vini
is provably unaffected and the two games' numbers are never averaged together
(ADR 0008).

What counts, and what does not:

* The **exam list** and the **pass rate** are Exams only, and only *submitted*
  ones. An in-progress paper has no result yet, an abandoned one was thrown
  away, and a Practice Session was never an exam. Only the Exam carries a pass
  mark, so only the Exam can be passed or failed.
* The **breakdowns** — by Level, by format, by topic — draw from every
  *submitted* Session, Practice and Error Review included. A question answered
  in Practice was still answered, and the advice "go and study sparkling wine"
  is truer for counting it. Abandoned and in-progress Sessions never
  contribute: only a submitted Session is a settled fact.

Every aggregation is done in Python over rows pulled with plain `select`s, the
way `sessions/router.py` does it, so the numbers are identical on the SQLite the
tests run and the PostgreSQL production runs.
"""
from datetime import datetime
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth.jwt import get_current_user_id
from app.database import get_session
from app.exams.model import (
    MODE_EXAM,
    STATUS_SUBMITTED,
    VERDICT_CORRECT,
    ExamAnswer,
    ExamSession,
)
from app.exams.service import exam_score_view, history, is_mastered, mastery_counts
from app.questions.model import FORMAT_OPEN, Question

router = APIRouter(prefix="/quiz", tags=["quiz"])

# Closed Questions are the tick-boxes — true/false and multiple choice — and
# Open Questions are the written ones. The ticket asks for exactly this split:
# the common pattern is doing fine on the Closed ones and collapsing on the
# written ones, and a two-way format breakdown is what surfaces it.
FORMAT_CLOSED = "closed"
FORMAT_OPEN_GROUP = "open"


# ── Response schemas ──────────────────────────────────────────────────────────

class ExamResult(BaseModel):
    """One submitted Exam as the profile lists it: the date it was sat, the
    percentage, whether it was passed, and how long it took."""

    id: int
    score_pct: float
    passed: bool
    duration_seconds: Optional[int]
    played_at: datetime


class QuizAggregate(BaseModel):
    total_exams: int
    exams_passed: int
    avg_score_pct: float
    best_score_pct: float


class Breakdown(BaseModel):
    """Performance along one axis — a Level, a format group, or a topic.

    `answered` is how many answers went into it, so the screen can lean on the
    percentage where the sample is real and stay quiet where a single answer
    would read as "100% or 0%"."""

    correct_pct: float
    answered: int


class LevelBreakdown(Breakdown):
    level: int


class FormatBreakdown(Breakdown):
    format: str


class TopicBreakdown(Breakdown):
    topic: str


class QuizStatsResponse(BaseModel):
    exams: List[ExamResult]
    aggregate: QuizAggregate
    by_level: List[LevelBreakdown]
    by_format: List[FormatBreakdown]
    by_topic: List[TopicBreakdown]
    # How many of this player's questions are still waiting to be Mastered — the
    # size of the Error Review pool, shown here so the profile can point at the
    # work that remains. Same rule as Error Review: three correct answers in
    # three distinct submitted Sessions retires a question.
    pending_mastery: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pct(correct: int, total: int) -> float:
    return round(correct / total * 100, 1) if total else 0.0


def _format_group(question_format: str) -> str:
    return FORMAT_OPEN_GROUP if question_format == FORMAT_OPEN else FORMAT_CLOSED


# ── GET /quiz/stats ───────────────────────────────────────────────────────────

@router.get("/stats", response_model=QuizStatsResponse)
def get_quiz_stats(
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    submitted = db.exec(
        select(ExamSession)
        .where(
            ExamSession.user_id == user_id,
            ExamSession.status == STATUS_SUBMITTED,
        )
        .order_by(ExamSession.submitted_at.desc())  # type: ignore[union-attr]
    ).all()

    pending_mastery = _pending_mastery(db, user_id)

    if not submitted:
        return QuizStatsResponse(
            exams=[],
            aggregate=QuizAggregate(
                total_exams=0, exams_passed=0, avg_score_pct=0.0, best_score_pct=0.0
            ),
            by_level=[],
            by_format=[],
            by_topic=[],
            pending_mastery=pending_mastery,
        )

    # ── The exam list and its aggregates (Exams only) ─────────────────────────
    exam_sessions = [
        s for s in submitted if s.mode == MODE_EXAM and s.score is not None and s.max_score > 0
    ]
    exams: List[ExamResult] = []
    exam_pcts: List[float] = []
    exams_passed = 0
    for s in exam_sessions:
        pct, passed = exam_score_view(s)  # type: ignore[misc]
        exam_pcts.append(pct)
        exams_passed += 1 if passed else 0
        exams.append(
            ExamResult(
                id=s.id,
                score_pct=pct,
                passed=passed,
                duration_seconds=s.duration_seconds,
                played_at=s.submitted_at or s.started_at,
            )
        )

    aggregate = QuizAggregate(
        total_exams=len(exam_sessions),
        exams_passed=exams_passed,
        avg_score_pct=round(sum(exam_pcts) / len(exam_pcts), 1) if exam_pcts else 0.0,
        best_score_pct=max(exam_pcts) if exam_pcts else 0.0,
    )

    # ── Breakdowns (every submitted Session) ──────────────────────────────────
    session_ids = [s.id for s in submitted]
    answers = db.exec(
        select(ExamAnswer).where(
            ExamAnswer.session_id.in_(session_ids),  # type: ignore[attr-defined]
            ExamAnswer.verdict.is_not(None),  # type: ignore[union-attr]
        )
    ).all()

    question_ids = {a.question_id for a in answers}
    questions = {
        q.id: q
        for q in db.exec(
            select(Question).where(Question.id.in_(question_ids))  # type: ignore[attr-defined]
        ).all()
    }

    level_correct: dict[int, int] = {}
    level_total: dict[int, int] = {}
    format_correct: dict[str, int] = {}
    format_total: dict[str, int] = {}
    topic_correct: dict[str, int] = {}
    topic_total: dict[str, int] = {}

    for a in answers:
        question = questions.get(a.question_id)
        if question is None:
            continue
        correct = 1 if a.verdict == VERDICT_CORRECT else 0

        level_total[question.level] = level_total.get(question.level, 0) + 1
        level_correct[question.level] = level_correct.get(question.level, 0) + correct

        group = _format_group(question.format)
        format_total[group] = format_total.get(group, 0) + 1
        format_correct[group] = format_correct.get(group, 0) + correct

        if question.topic:
            topic_total[question.topic] = topic_total.get(question.topic, 0) + 1
            topic_correct[question.topic] = topic_correct.get(question.topic, 0) + correct

    by_level = [
        LevelBreakdown(
            level=level,
            correct_pct=_pct(level_correct[level], level_total[level]),
            answered=level_total[level],
        )
        for level in sorted(level_total)
    ]
    by_format = [
        FormatBreakdown(
            format=group,
            correct_pct=_pct(format_correct[group], format_total[group]),
            answered=format_total[group],
        )
        for group in (FORMAT_CLOSED, FORMAT_OPEN_GROUP)
        if group in format_total
    ]
    by_topic = sorted(
        (
            TopicBreakdown(
                topic=topic,
                correct_pct=_pct(topic_correct[topic], topic_total[topic]),
                answered=topic_total[topic],
            )
            for topic in topic_total
        ),
        key=lambda row: row.correct_pct,
    )

    return QuizStatsResponse(
        exams=exams,
        aggregate=aggregate,
        by_level=by_level,
        by_format=by_format,
        by_topic=by_topic,
        pending_mastery=pending_mastery,
    )


def _pending_mastery(db: Session, user_id: int) -> int:
    """How many questions this player has answered that are not yet Mastered —
    the Error Review pool size, derived the same way Error Review derives it so
    the two numbers can never disagree."""
    attempts = history(db, user_id)
    if not attempts:
        return 0
    mastery = mastery_counts(db, user_id)
    return sum(
        1 for question_id in attempts if not is_mastered(mastery.get(question_id, 0))
    )
