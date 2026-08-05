"""The Exam of Promossi o Cirrotici.

Everything that decides the outcome happens here (ADR 0007): the backend draws
the paper, shuffles the options, keeps the correct answers to itself while the
Exam is in progress, and produces every Verdict. A grade computed in a context
the player controls is not a grade.
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
    PASS_MARK_PCT,
    STATUS_ABANDONED,
    STATUS_IN_PROGRESS,
    STATUS_SUBMITTED,
    TRUE_FALSE_OPTIONS,
    VERDICT_CORRECT,
    VERDICT_WRONG,
    ExamAnswer,
    ExamSession,
)
from app.questions.model import (
    FORMAT_MULTIPLE_CHOICE,
    FORMAT_OPEN,
    FORMAT_TRUE_FALSE,
    SUBTYPE_CONCEPTUAL,
    Question,
)

router = APIRouter(prefix="/quiz/exams", tags=["quiz"])


# ── Response schemas ──────────────────────────────────────────────────────────

class ExamQuestionRead(BaseModel):
    """One question of the paper as the player is allowed to see it.

    `correct_answer` stays `None` for as long as the Exam is in progress — the
    browser never holds the answer to a question it is still being asked. Once
    the Exam is submitted every Verdict is already fixed, so the recap can show
    the correct answer without giving anything away."""

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
    # only, and only once graded. It is *never* the bank's own `explanation`, which
    # stays unused in this scope (#16): a wrong Closed Question shows the
    # correct answer and nothing else.
    feedback: Optional[str]


class ExamRead(BaseModel):
    id: int
    mode: str
    status: str
    max_score: int
    score: Optional[int]
    score_pct: Optional[float]
    passed: Optional[bool]
    # False while an Open Question of a submitted paper is still ungraded. The
    # recap reads it to know that the Closed Questions below it are the whole
    # story so far, and that there is no score yet.
    grading_complete: bool
    started_at: datetime
    submitted_at: Optional[datetime]
    duration_seconds: Optional[int]
    questions: List[ExamQuestionRead]


class AnswerRequest(BaseModel):
    # `None` clears an answer: skipping a question is a first-class move.
    answer: Optional[str] = None


class GradeRequest(BaseModel):
    # Only the agent's explanations follow it; the questions and the reference
    # answers are Italian whatever the interface language.
    language: str = "en"


class AnswerAccepted(BaseModel):
    """Deliberately empty of any Verdict. In the Exam nothing is revealed until
    the paper is handed in; Practice, where feedback is immediate, will answer
    with more than this."""

    question_id: int
    answer: Optional[str]


# ── Serialization ─────────────────────────────────────────────────────────────

def _as_utc(moment: Optional[datetime]) -> Optional[datetime]:
    """Timestamps are written in UTC but the column is naive, so they come back
    from the database without a zone. Say so explicitly: the browser reads
    `started_at` to run the clock, and a bare ISO string is parsed as local
    time, which would put the elapsed time out by the whole offset."""
    if moment is None:
        return None
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment


def _read_exam(exam: ExamSession, answers: List[ExamAnswer], questions: Dict[int, Question]) -> ExamRead:
    submitted = exam.status == STATUS_SUBMITTED
    grading_complete = submitted and all(answer.verdict is not None for answer in answers)
    graded = grading_complete and exam.score is not None and exam.max_score > 0

    # The percentage is for the screen; the verdict is decided on whole marks.
    # Rounding first would let a paper that fell just short of the mark round
    # up onto it — impossible over 30 questions, but Practice brings papers of
    # 10 and 20 where it would not be.
    score_pct = round(exam.score / exam.max_score * 100, 1) if graded else None
    passed = exam.score * 100 >= exam.max_score * PASS_MARK_PCT if graded else None

    return ExamRead(
        id=exam.id,
        mode=exam.mode,
        status=exam.status,
        max_score=exam.max_score,
        score=exam.score,
        score_pct=score_pct,
        passed=passed,
        grading_complete=grading_complete,
        started_at=_as_utc(exam.started_at),
        submitted_at=_as_utc(exam.submitted_at),
        duration_seconds=exam.duration_seconds,
        questions=[
            ExamQuestionRead(
                question_id=answer.question_id,
                position=answer.position,
                text=questions[answer.question_id].text,
                format=questions[answer.question_id].format,
                level=questions[answer.question_id].level,
                options=list(answer.served_options),
                topic=questions[answer.question_id].topic,
                answer=answer.answer,
                verdict=answer.verdict,
                correct_answer=(
                    questions[answer.question_id].reference_answer if submitted else None
                ),
                feedback=answer.explanation if submitted else None,
            )
            for answer in sorted(answers, key=lambda a: a.position)
        ],
    )


# ── Loading ───────────────────────────────────────────────────────────────────

def _load_exam(db: Session, exam_id: int, user_id: int) -> ExamSession:
    """An Exam belonging to somebody else is not found rather than forbidden:
    whose Exam a given id is is not the caller's business either."""
    exam = db.get(ExamSession, exam_id)
    if exam is None or exam.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="exam_not_found")
    return exam


def _in_progress_exam(db: Session, user_id: int) -> Optional[ExamSession]:
    """The one Session the player has open, if any. There is at most one across
    every mode of the game: starting a second requires handing the first in or
    abandoning it, so no tap can ever silently destroy work."""
    return db.exec(
        select(ExamSession)
        .where(ExamSession.user_id == user_id, ExamSession.status == STATUS_IN_PROGRESS)
        .order_by(ExamSession.id.desc())  # type: ignore[union-attr]
        .limit(1)
    ).first()


def _load_answers(db: Session, exam_id: int) -> List[ExamAnswer]:
    return list(
        db.exec(
            select(ExamAnswer)
            .where(ExamAnswer.session_id == exam_id)
            .order_by(ExamAnswer.position)  # type: ignore[arg-type]
        ).all()
    )


def _load_questions(db: Session, answers: List[ExamAnswer]) -> Dict[int, Question]:
    ids = [a.question_id for a in answers]
    if not ids:
        return {}
    rows = db.exec(select(Question).where(Question.id.in_(ids))).all()  # type: ignore[attr-defined]
    return {q.id: q for q in rows}


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
    return [a.question_id for a in _load_answers(db, previous.id)]


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


def _serve_options(question: Question) -> List[str]:
    """In the source bank the correct option is always the first one, so the
    shuffle is a correctness requirement rather than a nicety. It happens once,
    here, and is persisted: a resumed Exam shows the same paper."""
    if question.format == FORMAT_MULTIPLE_CHOICE:
        options = list(question.options)
        random.shuffle(options)
        return options
    if question.format == FORMAT_TRUE_FALSE:
        return list(TRUE_FALSE_OPTIONS)
    return []


# ── Grading ───────────────────────────────────────────────────────────────────

def _grade_closed(question: Question, answer: Optional[str]) -> str:
    """Exact comparison, no model call. Case and surrounding whitespace are not
    what is being tested."""
    if answer is None or not answer.strip():
        return VERDICT_WRONG
    correct = answer.strip().casefold() == question.reference_answer.strip().casefold()
    return VERDICT_CORRECT if correct else VERDICT_WRONG


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

@router.post("", status_code=201, response_model=ExamRead)
def start_exam(
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Draws a paper — unless the player already has one open, in which case
    nothing is drawn and nothing is destroyed. The caller is told which of the
    two refusals it hit and offers the choice: resume, or abandon and start
    again."""
    if _in_progress_exam(db, user_id) is not None:
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
            served_options=_serve_options(question),
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

    return _read_exam(exam, answers, {q.id: q for q in drawn})


# ── GET /quiz/exams/current ───────────────────────────────────────────────────
# Declared before `/{exam_id}`: routes match in the order they are written, and
# "current" is not an integer.

@router.get("/current", response_model=Optional[ExamRead])
def get_current_exam(
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """The Session the player left open, or `null` when the slot is free.

    It carries the whole paper with the answers already given, so returning to
    the game can say what is in progress and how far it got without the player
    having to open it to find out. In-progress Sessions do not expire: the one
    left in February is still here in August."""
    exam = _in_progress_exam(db, user_id)
    if exam is None:
        return None

    answers = _load_answers(db, exam.id)
    return _read_exam(exam, answers, _load_questions(db, answers))


# ── GET /quiz/exams/{exam_id} ─────────────────────────────────────────────────

@router.get("/{exam_id}", response_model=ExamRead)
def get_exam(
    exam_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """One resource for the paper and for the result: while the Exam is in
    progress it carries what was answered, once submitted it also carries the
    Verdicts and the correct answers."""
    exam = _load_exam(db, exam_id, user_id)
    answers = _load_answers(db, exam_id)
    return _read_exam(exam, answers, _load_questions(db, answers))


# ── PUT /quiz/exams/{exam_id}/answers/{question_id} ───────────────────────────

@router.put("/{exam_id}/answers/{question_id}", response_model=AnswerAccepted)
def record_answer(
    exam_id: int,
    question_id: int,
    body: AnswerRequest,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    exam = _load_exam(db, exam_id, user_id)
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

@router.post("/{exam_id}/submit", response_model=ExamRead)
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
    exam = _load_exam(db, exam_id, user_id)
    if exam.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_in_progress")

    answers = _load_answers(db, exam_id)
    questions = _load_questions(db, answers)

    for answer in answers:
        question = questions[answer.question_id]
        if question.format != FORMAT_OPEN:
            answer.verdict = _grade_closed(question, answer.answer)
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

    return _read_exam(exam, answers, questions)


# ── POST /quiz/exams/{exam_id}/abandon ────────────────────────────────────────

@router.post("/{exam_id}/abandon", response_model=ExamRead)
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
    exam = _load_exam(db, exam_id, user_id)
    if exam.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_in_progress")

    exam.status = STATUS_ABANDONED
    db.add(exam)
    db.commit()
    db.refresh(exam)

    answers = _load_answers(db, exam_id)
    return _read_exam(exam, answers, _load_questions(db, answers))


# ── POST /quiz/exams/{exam_id}/grade ──────────────────────────────────────────

@router.post("/{exam_id}/grade", response_model=ExamRead)
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
    exam = _load_exam(db, exam_id, user_id)
    if exam.status != STATUS_SUBMITTED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_submitted")

    answers = _load_answers(db, exam_id)
    questions = _load_questions(db, answers)

    ungraded = _ungraded_open(answers, questions)
    if not ungraded:
        return _read_exam(exam, answers, questions)

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

    return _read_exam(exam, answers, questions)
