"""What every mode of Promossi o Cirrotici does the same way.

The Exam and Practice are the same resource with a different `mode`: one row in
`exam_sessions`, one row per question in `exam_answers`, drawn and graded by the
backend (ADR 0007). Loading a Session, deciding what of it the browser is
allowed to see, shuffling the options and marking a Closed Question are
therefore written once, here, and the mode-specific rules live in the routers.

The one rule this module exists to hold is what a payload may contain: **the
browser never holds the answer to a question it is still being asked.** The
Exam reveals everything when the paper is handed in; Practice reveals one
question at a time, the moment that question carries a Verdict. Both are the
same condition, expressed once in `read_session`.
"""
import random
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.exams.model import (
    MODE_EXAM,
    PASS_MARK_PCT,
    STATUS_IN_PROGRESS,
    STATUS_SUBMITTED,
    TRUE_FALSE_OPTIONS,
    VERDICT_CORRECT,
    VERDICT_WRONG,
    ExamAnswer,
    ExamSession,
)
from app.questions.model import FORMAT_MULTIPLE_CHOICE, FORMAT_TRUE_FALSE, Question


# ── Response schemas ──────────────────────────────────────────────────────────

class SessionQuestionRead(BaseModel):
    """One question of a Session as the player is allowed to see it.

    `correct_answer` and `feedback` stay `None` until the question is over —
    handed in with the paper in the Exam, answered and marked in Practice. A
    question still being asked never carries its own answer."""

    question_id: int
    position: int
    text: str
    format: str
    level: int
    options: List[str]
    topic: Optional[str]
    answer: Optional[str]
    verdict: Optional[str]
    correct_answer: Optional[str]
    # What the grading agent told the player about their answer. Open Questions
    # only, and only once graded. It is *never* the bank's own `explanation`,
    # which spells the answer out in prose and stays unused in this scope (#16):
    # a wrong Closed Question shows the correct answer and nothing else.
    feedback: Optional[str]


class SessionRead(BaseModel):
    id: int
    mode: str
    # The Level a Practice Session was drawn from. `None` on an Exam, which is
    # deliberately blind across all three.
    level: Optional[int]
    status: str
    max_score: int
    score: Optional[int]
    score_pct: Optional[float]
    # Whether the paper was passed — an Exam question only. Practice never
    # passes or fails anybody, so it answers `None` and the screen has nothing
    # to render even if it tried.
    passed: Optional[bool]
    # False while an answer that was actually given is still without a Verdict.
    # The Exam recap reads it to know the Closed Questions below it are the
    # whole story so far, and that there is no score yet.
    grading_complete: bool
    started_at: datetime
    submitted_at: Optional[datetime]
    duration_seconds: Optional[int]
    questions: List[SessionQuestionRead]


# ── Serialization ─────────────────────────────────────────────────────────────

def as_utc(moment: Optional[datetime]) -> Optional[datetime]:
    """Timestamps are written in UTC but the column is naive, so they come back
    from the database without a zone. Say so explicitly: the browser reads
    `started_at` to run the clock, and a bare ISO string is parsed as local
    time, which would put the elapsed time out by the whole offset."""
    if moment is None:
        return None
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment


def read_session(
    exam: ExamSession, answers: List[ExamAnswer], questions: Dict[int, Question]
) -> SessionRead:
    submitted = exam.status == STATUS_SUBMITTED

    # An answer that was given and has no Verdict is one the agent could not
    # read. A question nobody has reached yet is not outstanding — which is why
    # this counts answers rather than questions, and why a Practice Session
    # ended halfway is not reported as "still being marked".
    grading_complete = not any(
        answer.verdict is None and (answer.answer or "").strip() for answer in answers
    )
    if not submitted and exam.mode == MODE_EXAM:
        # Nothing about an Exam is settled until it is handed in, and no Exam
        # question carries a Verdict before then anyway.
        grading_complete = False

    scored = exam.score is not None and exam.max_score > 0
    # The percentage is for the screen; the verdict is decided on whole marks.
    # Rounding first would let a paper that fell just short of the mark round up
    # onto it — impossible over 30 questions, but Practice brings papers of 10
    # and 20 where it would not be.
    score_pct = round(exam.score / exam.max_score * 100, 1) if scored else None
    passed = (
        exam.score * 100 >= exam.max_score * PASS_MARK_PCT
        if scored and exam.mode == MODE_EXAM
        else None
    )

    return SessionRead(
        id=exam.id,
        mode=exam.mode,
        level=exam.level,
        status=exam.status,
        max_score=exam.max_score,
        score=exam.score,
        score_pct=score_pct,
        passed=passed,
        grading_complete=grading_complete,
        started_at=as_utc(exam.started_at),
        submitted_at=as_utc(exam.submitted_at),
        duration_seconds=exam.duration_seconds,
        questions=[
            _read_question(answer, questions[answer.question_id], submitted)
            for answer in sorted(answers, key=lambda a: a.position)
        ],
    )


def _read_question(
    answer: ExamAnswer, question: Question, submitted: bool
) -> SessionQuestionRead:
    # A question is over when it carries a Verdict, or when the whole paper has
    # been handed in. Until then nothing that gives the answer away is served —
    # in the Exam that is the entire sitting, in Practice it is one question.
    over = submitted or answer.verdict is not None

    return SessionQuestionRead(
        question_id=answer.question_id,
        position=answer.position,
        text=question.text,
        format=question.format,
        level=question.level,
        options=list(answer.served_options),
        topic=question.topic,
        answer=answer.answer,
        verdict=answer.verdict,
        correct_answer=question.reference_answer if over else None,
        feedback=answer.explanation if over else None,
    )


# ── Loading ───────────────────────────────────────────────────────────────────

def load_session(db: Session, exam_id: int, user_id: int, mode: str) -> ExamSession:
    """Somebody else's Session is not found rather than forbidden: whose a given
    id is is not the caller's business either. A Session of the wrong mode is
    not found for the same reason — the Practice endpoints are not a second way
    into an Exam."""
    exam = db.get(ExamSession, exam_id)
    if exam is None or exam.user_id != user_id or exam.mode != mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="exam_not_found")
    return exam


def in_progress_session(db: Session, user_id: int) -> Optional[ExamSession]:
    """The one Session the player has open, if any. There is at most one across
    every mode of the game: starting a second requires handing the first in or
    abandoning it, so no tap can ever silently destroy work."""
    return db.exec(
        select(ExamSession)
        .where(ExamSession.user_id == user_id, ExamSession.status == STATUS_IN_PROGRESS)
        .order_by(ExamSession.id.desc())  # type: ignore[union-attr]
        .limit(1)
    ).first()


def load_answers(db: Session, exam_id: int) -> List[ExamAnswer]:
    return list(
        db.exec(
            select(ExamAnswer)
            .where(ExamAnswer.session_id == exam_id)
            .order_by(ExamAnswer.position)  # type: ignore[arg-type]
        ).all()
    )


def load_questions(db: Session, answers: List[ExamAnswer]) -> Dict[int, Question]:
    ids = [a.question_id for a in answers]
    if not ids:
        return {}
    rows = db.exec(select(Question).where(Question.id.in_(ids))).all()  # type: ignore[attr-defined]
    return {q.id: q for q in rows}


# ── Serving ───────────────────────────────────────────────────────────────────

def serve_options(question: Question) -> List[str]:
    """In the source bank the correct option is always the first one, so the
    shuffle is a correctness requirement rather than a nicety. It happens once,
    when the Session is drawn, and is persisted: a resumed Session shows the
    same paper."""
    if question.format == FORMAT_MULTIPLE_CHOICE:
        options = list(question.options)
        random.shuffle(options)
        return options
    if question.format == FORMAT_TRUE_FALSE:
        return list(TRUE_FALSE_OPTIONS)
    return []


# ── Grading ───────────────────────────────────────────────────────────────────

def grade_closed(question: Question, answer: Optional[str]) -> str:
    """Exact comparison, no model call. Case and surrounding whitespace are not
    what is being tested."""
    if answer is None or not answer.strip():
        return VERDICT_WRONG
    correct = answer.strip().casefold() == question.reference_answer.strip().casefold()
    return VERDICT_CORRECT if correct else VERDICT_WRONG
