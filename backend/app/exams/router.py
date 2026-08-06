"""The Exam of Promossi o Cirrotici.

Everything that decides the outcome happens here (ADR 0007): the backend draws
the paper, shuffles the options, keeps the correct answers to itself while the
Exam is in progress, and produces every Verdict. A grade computed in a context
the player controls is not a grade.

What the Exam shares with Practice — loading a Session, deciding what of it the
browser may see, marking a Closed Question — lives in `app.exams.service`. What
is left here is what makes an Exam an Exam: a blind draw across all three
Levels, no feedback until the paper is handed in, and a pass mark.
"""
import random
from datetime import datetime, timezone
from typing import Annotated, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.ai.grading import OpenAnswerToGrade, grade_open_answers
from app.auth.jwt import get_current_user_id
from app.database import get_session
from app.exams.model import (
    EXAM_COMPOSITION,
    EXAM_LENGTH,
    MAX_OPEN_ANSWER_CHARS,
    MODE_EXAM,
    STATUS_ABANDONED,
    STATUS_IN_PROGRESS,
    STATUS_SUBMITTED,
    VERDICT_CORRECT,
    VERDICT_WRONG,
    ExamAnswer,
    ExamSession,
)
from app.exams.service import (
    SessionRead,
    grade_closed,
    in_progress_session,
    load_answers,
    load_questions,
    load_session,
    read_session,
    serve_options,
)
from app.questions.model import FORMAT_OPEN, SUBTYPE_CONCEPTUAL, Question

router = APIRouter(prefix="/quiz/exams", tags=["quiz"])


# ── Request schemas ───────────────────────────────────────────────────────────

class AnswerRequest(BaseModel):
    # `None` clears an answer: skipping a question is a first-class move.
    answer: Optional[str] = None


class GradeRequest(BaseModel):
    # Only the agent's explanations follow it; the questions and the reference
    # answers are Italian whatever the interface language.
    language: str = "en"


class AnswerAccepted(BaseModel):
    """Deliberately empty of any Verdict. In the Exam nothing is revealed until
    the paper is handed in — Practice, where feedback is immediate, answers with
    more than this."""

    question_id: int
    answer: Optional[str]


# ── Drawing the paper ─────────────────────────────────────────────────────────

def _previous_exam_question_ids(db: Session, user_id: int) -> List[int]:
    """The questions of the player's immediately preceding Exam, which this one
    must not repeat. Only the last one: an Exam that avoided everything ever
    seen would drain the bank rather than measure anything. Status does not
    matter — a paper walked away from is still one the player has just read."""
    previous = db.exec(
        select(ExamSession)
        .where(ExamSession.user_id == user_id, ExamSession.mode == MODE_EXAM)
        .order_by(ExamSession.id.desc())  # type: ignore[union-attr]
        .limit(1)
    ).first()
    if previous is None:
        return []
    return [a.question_id for a in load_answers(db, previous.id)]


def _draw(db: Session, question_format: str, count: int, excluded: List[int]) -> List[Question]:
    """Blind and random across the whole active bank. Never filtered by Level:
    the real exam is one sitting across all three."""
    statement = select(Question).where(
        Question.active,  # type: ignore[arg-type]
        Question.format == question_format,
    )
    if excluded:
        statement = statement.where(Question.id.not_in(excluded))  # type: ignore[attr-defined]

    drawn = list(db.exec(statement.order_by(func.random()).limit(count)).all())
    if len(drawn) < count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="question_bank_too_small",
        )
    return drawn


# ── Grading ───────────────────────────────────────────────────────────────────

def _ungraded_open(
    answers: List[ExamAnswer], questions: Dict[int, Question]
) -> List[ExamAnswer]:
    return [
        answer
        for answer in answers
        if questions[answer.question_id].format == FORMAT_OPEN and answer.verdict is None
    ]


def _settle_score(exam: ExamSession, answers: List[ExamAnswer]) -> bool:
    """A paper has a score when every question on it has a Verdict, and not a
    moment before. Counting the ungraded ones wrong would fail a candidate for
    a model timeout; counting them right would pass one for the same reason."""
    if any(answer.verdict is None for answer in answers):
        exam.score = None
        return False
    exam.score = sum(1 for answer in answers if answer.verdict == VERDICT_CORRECT)
    return True


# ── POST /quiz/exams ──────────────────────────────────────────────────────────

@router.post("", status_code=201, response_model=SessionRead)
def start_exam(
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Draws a paper — unless the player already has a Session open in any mode,
    in which case nothing is drawn and nothing is destroyed. The caller is told
    which of the two refusals it hit and offers the choice: resume, or abandon
    and start again."""
    if in_progress_session(db, user_id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_in_progress")

    excluded = _previous_exam_question_ids(db, user_id)

    drawn: List[Question] = []
    for question_format, count in EXAM_COMPOSITION.items():
        drawn.extend(_draw(db, question_format, count, excluded))
    random.shuffle(drawn)

    exam = ExamSession(user_id=user_id, mode=MODE_EXAM, max_score=EXAM_LENGTH)
    db.add(exam)
    db.flush()

    answers = [
        ExamAnswer(
            session_id=exam.id,
            question_id=question.id,
            position=position,
            served_options=serve_options(question),
        )
        for position, question in enumerate(drawn)
    ]
    for answer in answers:
        db.add(answer)

    try:
        db.commit()
    except IntegrityError:
        # The other tab got there a moment earlier and the partial unique index
        # refused this paper. Same answer as the check above: nothing drawn,
        # nothing destroyed.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_in_progress")

    db.refresh(exam)

    return read_session(exam, answers, {q.id: q for q in drawn})


# ── GET /quiz/exams/current ───────────────────────────────────────────────────
# Declared before `/{exam_id}`: routes match in the order they are written, and
# "current" is not an integer.

@router.get("/current", response_model=Optional[SessionRead])
def get_current_exam(
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """The Session the player left open, or `null` when the slot is free.

    Not the Exam's alone: there is one slot across every mode, so this answers
    with a Practice Session just as readily and `mode` says which it is. It
    carries the whole paper with the answers already given, so returning to the
    game can say what is in progress and how far it got without the player
    having to open it to find out. In-progress Sessions do not expire: the one
    left in February is still here in August."""
    exam = in_progress_session(db, user_id)
    if exam is None:
        return None

    answers = load_answers(db, exam.id)
    return read_session(exam, answers, load_questions(db, answers))


# ── GET /quiz/exams/{exam_id} ─────────────────────────────────────────────────

@router.get("/{exam_id}", response_model=SessionRead)
def get_exam(
    exam_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """One resource for the paper and for the result: while the Exam is in
    progress it carries what was answered, once submitted it also carries the
    Verdicts and the correct answers."""
    exam = load_session(db, exam_id, user_id, MODE_EXAM)
    answers = load_answers(db, exam_id)
    return read_session(exam, answers, load_questions(db, answers))


# ── PUT /quiz/exams/{exam_id}/answers/{question_id} ───────────────────────────

@router.put("/{exam_id}/answers/{question_id}", response_model=AnswerAccepted)
def record_answer(
    exam_id: int,
    question_id: int,
    body: AnswerRequest,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    exam = load_session(db, exam_id, user_id, MODE_EXAM)
    if exam.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_in_progress")

    answer = db.exec(
        select(ExamAnswer).where(
            ExamAnswer.session_id == exam_id, ExamAnswer.question_id == question_id
        )
    ).first()
    if answer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="question_not_in_exam")

    value = body.answer.strip() if body.answer else None
    # A Closed Question can only be answered with something it was offered. An
    # answer from outside the served options is a bug in the caller, not a
    # wrong answer by the player, and is refused rather than quietly marked.
    if value is not None and answer.served_options and value not in answer.served_options:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="answer_not_offered"
        )
    # Refused rather than truncated: silently cutting a student's answer in
    # half and then grading what is left is the worse of the two.
    if value is not None and len(value) > MAX_OPEN_ANSWER_CHARS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="answer_too_long"
        )

    answer.answer = value
    db.add(answer)
    db.commit()

    return AnswerAccepted(question_id=question_id, answer=value)


# ── POST /quiz/exams/{exam_id}/submit ─────────────────────────────────────────

@router.post("/{exam_id}/submit", response_model=SessionRead)
def submit_exam(
    exam_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Handing in is always possible, blanks and all — the player is never
    trapped in a Session they want to end. A blank is simply wrong.

    Only the Closed Questions are graded here, and they are graded instantly:
    the recap opens on them while the written answers are still with the
    agent. Grading the Open Questions is `POST /grade`, because a model call
    that hangs must not hold the paper the student has already handed in."""
    exam = load_session(db, exam_id, user_id, MODE_EXAM)
    if exam.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_in_progress")

    answers = load_answers(db, exam_id)
    questions = load_questions(db, answers)

    for answer in answers:
        question = questions[answer.question_id]
        if question.format != FORMAT_OPEN:
            answer.verdict = grade_closed(question, answer.answer)
        elif not (answer.answer or "").strip():
            # A blank is wrong without asking anybody. There is nothing in it
            # for the agent to read, and no reason to spend a call on it.
            answer.verdict = VERDICT_WRONG
        db.add(answer)

    submitted_at = datetime.now(timezone.utc)
    started = exam.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)

    exam.status = STATUS_SUBMITTED
    exam.submitted_at = submitted_at
    exam.duration_seconds = max(0, int((submitted_at - started).total_seconds()))
    _settle_score(exam, answers)
    db.add(exam)
    db.commit()
    db.refresh(exam)

    return read_session(exam, answers, questions)


# ── POST /quiz/exams/{exam_id}/abandon ────────────────────────────────────────

@router.post("/{exam_id}/abandon", response_model=SessionRead)
def abandon_exam(
    exam_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Walk away from the paper on purpose, freeing the slot.

    It is never a side effect of starting another one: throwing away twenty
    minutes of work is a decision the player makes explicitly, and the screen
    asks again before this is called. The row stays — its questions still keep
    the next paper from repeating them — but it has no score and no submission
    time, which is what keeps it out of statistics.
    """
    exam = load_session(db, exam_id, user_id, MODE_EXAM)
    if exam.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_in_progress")

    exam.status = STATUS_ABANDONED
    db.add(exam)
    db.commit()
    db.refresh(exam)

    answers = load_answers(db, exam_id)
    return read_session(exam, answers, load_questions(db, answers))


# ── POST /quiz/exams/{exam_id}/grade ──────────────────────────────────────────

@router.post("/{exam_id}/grade", response_model=SessionRead)
async def grade_exam(
    exam_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    body: Optional[GradeRequest] = None,
    db: Session = Depends(get_session),
):
    """Grade the written answers of a handed-in paper.

    Idempotent and safely repeatable: it looks only at the questions that have
    no Verdict yet, so a paper the agent got halfway through is finished by
    calling again rather than graded twice. Whatever came back is kept even
    when the rest did not — a retry then costs one short call, not fourteen.

    A paper that is still short of Verdicts answers 503 and keeps no score. It
    is not failed, not passed and not finished: it is retryable.
    """
    exam = load_session(db, exam_id, user_id, MODE_EXAM)
    if exam.status != STATUS_SUBMITTED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_submitted")

    answers = load_answers(db, exam_id)
    questions = load_questions(db, answers)

    ungraded = _ungraded_open(answers, questions)
    if not ungraded:
        return read_session(exam, answers, questions)

    language = body.language if body else "en"
    graded = await grade_open_answers(
        [
            OpenAnswerToGrade(
                question_id=answer.question_id,
                question=questions[answer.question_id].text,
                reference_answer=questions[answer.question_id].reference_answer,
                player_answer=answer.answer or "",
                subtype=questions[answer.question_id].open_subtype or SUBTYPE_CONCEPTUAL,
            )
            for answer in ungraded
        ],
        language,
    )

    for answer in ungraded:
        verdict = graded.get(answer.question_id)
        if verdict is None:
            continue
        answer.verdict = VERDICT_CORRECT if verdict.acceptable else VERDICT_WRONG
        answer.explanation = verdict.explanation
        db.add(answer)

    complete = _settle_score(exam, answers)
    db.add(exam)
    db.commit()
    db.refresh(exam)

    if not complete:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="grading_incomplete"
        )

    return read_session(exam, answers, questions)
