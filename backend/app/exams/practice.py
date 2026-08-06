"""Practice mode of Promossi o Cirrotici — where the studying happens.

It shares the Exam's tables and its service layer, and differs from it in
exactly three ways a player can see:

* it is drawn from **one chosen Level**, because a student practises the block
  they have lessons on this month;
* it comes in the **length they have time for**, in the Exam's own format
  proportions, so the Open Questions stay the largest block;
* the **Verdict lands the moment the answer does**, while the reasoning behind
  it is still fresh. That is the whole reason the mode exists.

Nothing here passes or fails anybody. The only pass mark in the product is the
Exam's, and it stays that way.

The draw is **adaptive**, which the Exam's deliberately is not: never-seen
questions first, then the ones this player got wrong, then the ones they have
not seen for longest. An Exam that favoured your weak spots would stop
measuring whether you would pass; a Practice Session that did not would waste
the time you brought to it.
"""
import random
from datetime import datetime, timezone
from typing import Annotated, Dict, List, NamedTuple, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.ai.grading import OpenAnswerToGrade, grade_open_answers
from app.auth.jwt import get_current_user_id
from app.database import get_session
from app.exams.model import (
    MAX_OPEN_ANSWER_CHARS,
    MODE_PRACTICE,
    PRACTICE_COMPOSITION,
    PRACTICE_LENGTHS,
    PRACTICE_LEVELS,
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

router = APIRouter(prefix="/quiz/practice", tags=["quiz"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class StartPracticeRequest(BaseModel):
    level: int
    length: int


class PracticeAnswerRequest(BaseModel):
    answer: str
    # The agent writes its note to the player in the interface language; the
    # question and the reference answer are Italian whatever it says.
    language: str = "en"


class PracticeAnswerRead(BaseModel):
    """The answer to one question and what became of it — everything the screen
    needs to show the correction without refetching the whole Session.

    `verdict` is `None` only when the agent could not read a written answer.
    That is not a wrong answer and is never shown as one: the question keeps
    its answer, gives nothing away, and can simply be sent again."""

    question_id: int
    answer: Optional[str]
    verdict: Optional[str]
    correct_answer: Optional[str]
    feedback: Optional[str]


# ── Drawing the Session ───────────────────────────────────────────────────────

class Attempt(NamedTuple):
    """The last thing this player did with one question. Named rather than a
    bare tuple because `history[q.id][0]` says nothing about what is being
    sorted on, and the sort is the whole point of the adaptive draw."""

    seen_at: int  # the answer's row id — see `_history` on what it does and does not mean
    verdict: Optional[str]


def _history(db: Session, user_id: int) -> Dict[int, Attempt]:
    """What this player has made of each question they have ever answered, as
    `question_id -> Attempt`.

    Only answers that were actually given count. A question that was drawn onto
    a Session and never reached has not been seen, and pushing it to the back
    of the queue would punish a student for stopping early.

    The answer id stands in for recency, and it is worth being exact about what
    that buys: an `exam_answers` row is written when the Session is *drawn* and
    only updated when the question is answered, so a higher id means a later
    Session — not a later keystroke. Recency is therefore at Session
    granularity, which is the granularity "least recently seen" means anyway;
    within one Session the order is the order the questions were drawn in, and
    nothing depends on it. Buying finer than that would cost a column and a
    migration to order questions inside a Session nobody is comparing.

    History is read across every mode, because a question you got wrong in an
    Exam last week is exactly one Practice should bring back.
    """
    rows = db.exec(
        select(ExamAnswer.question_id, ExamAnswer.id, ExamAnswer.verdict)
        .join(ExamSession, ExamAnswer.session_id == ExamSession.id)  # type: ignore[arg-type]
        .where(ExamSession.user_id == user_id, ExamAnswer.answer.is_not(None))  # type: ignore[union-attr]
        .order_by(ExamAnswer.id)  # type: ignore[arg-type]
    ).all()
    # Ordered by id, so the last row for a question is the one that survives.
    return {
        question_id: Attempt(seen_at=answer_id, verdict=verdict)
        for question_id, answer_id, verdict in rows
    }


def _draw_adaptive(
    db: Session,
    user_id: int,
    question_format: str,
    level: int,
    count: int,
    history: Dict[int, Attempt],
) -> List[Question]:
    """`count` questions of one format from one Level, in the order that is
    worth the student's time: never seen, then previously wrong, then whatever
    they have not looked at for longest."""
    candidates = list(
        db.exec(
            select(Question).where(
                Question.active,  # type: ignore[arg-type]
                Question.format == question_format,
                Question.level == level,
            )
        ).all()
    )
    if len(candidates) < count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="question_bank_too_small"
        )

    # Shuffled first so that the buckets below break ties randomly rather than
    # by primary key — two Sessions in a row must not open on the same
    # question just because it was inserted first.
    random.shuffle(candidates)

    unseen = [q for q in candidates if q.id not in history]
    seen = [q for q in candidates if q.id in history]
    wrong = sorted(
        (q for q in seen if history[q.id].verdict == VERDICT_WRONG),
        key=lambda q: history[q.id].seen_at,
    )
    rest = sorted(
        (q for q in seen if history[q.id].verdict != VERDICT_WRONG),
        key=lambda q: history[q.id].seen_at,
    )

    return (unseen + wrong + rest)[:count]


# ── Scoring ───────────────────────────────────────────────────────────────────

def _settle_practice_score(exam: ExamSession, answers: List[ExamAnswer]) -> None:
    """Practice is scored on what was actually marked, and on nothing else.

    A question never reached and an answer the agent could not read are both
    left out of the total rather than counted wrong — the first was not
    attempted, and the second must never be failed for a model's sake. So a
    Session ended after four questions reads "4 out of 4", which is the truth
    about it. There is no pass mark to distort: `passed` is `None` in this mode
    whatever the number says.

    This overwrites the length the Session was drawn at, and deliberately: after
    the fact, "how many did I get right" is about the questions that were
    marked. The chosen length is not lost by it — one `exam_answers` row exists
    per question drawn, so `len(answers)` is still the 10, 20 or 30 the student
    asked for, and anything reporting on Sessions later reads it from there
    rather than from `max_score`.
    """
    marked = [answer for answer in answers if answer.verdict is not None]
    exam.max_score = len(marked)
    exam.score = sum(1 for answer in marked if answer.verdict == VERDICT_CORRECT)


# ── POST /quiz/practice ───────────────────────────────────────────────────────

@router.post("", status_code=201, response_model=SessionRead)
def start_practice(
    body: StartPracticeRequest,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Draws a Practice Session at the chosen Level and length.

    Refused, like the Exam, while the player has any Session open: there is one
    slot across every mode of the game and nothing leaves it by accident."""
    if body.level not in PRACTICE_LEVELS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="level_not_offered"
        )
    if body.length not in PRACTICE_LENGTHS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="length_not_offered"
        )
    if in_progress_session(db, user_id) is not None:
        # The name predates the other modes: it is the game's one slot being
        # taken, whatever mode is holding it.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_in_progress")

    history = _history(db, user_id)
    drawn: List[Question] = []
    for question_format, count in PRACTICE_COMPOSITION[body.length].items():
        drawn.extend(
            _draw_adaptive(db, user_id, question_format, body.level, count, history)
        )

    random.shuffle(drawn)

    practice = ExamSession(
        user_id=user_id,
        mode=MODE_PRACTICE,
        level=body.level,
        max_score=body.length,
    )
    db.add(practice)
    db.flush()

    answers = [
        ExamAnswer(
            session_id=practice.id,
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
        # refused this one. Nothing drawn, nothing destroyed.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_in_progress")

    db.refresh(practice)

    return read_session(practice, answers, {q.id: q for q in drawn})


# ── GET /quiz/practice/{session_id} ───────────────────────────────────────────

@router.get("/{session_id}", response_model=SessionRead)
def get_practice(
    session_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """The Session as it stands: the questions, what has been answered, and the
    correction on each question that has already been marked. A question not
    yet answered carries none of its answer, exactly as in the Exam."""
    practice = load_session(db, session_id, user_id, MODE_PRACTICE)
    answers = load_answers(db, session_id)
    return read_session(practice, answers, load_questions(db, answers))


# ── PUT /quiz/practice/{session_id}/answers/{question_id} ─────────────────────

@router.put("/{session_id}/answers/{question_id}", response_model=PracticeAnswerRead)
async def answer_practice_question(
    session_id: int,
    question_id: int,
    body: PracticeAnswerRequest,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Records one answer and marks it on the spot.

    A Closed Question is marked by comparison and comes straight back. A
    written one goes to the grading agent as a single item — there is no batch
    here to confuse, which is the one advantage Practice has over the Exam.

    An answer is given once. Being shown the right answer and then being
    allowed to change yours is not studying, so a question that already carries
    a Verdict is closed. A written answer the agent could not read carries no
    Verdict and is therefore *not* closed: sending it again is the retry.
    """
    practice = load_session(db, session_id, user_id, MODE_PRACTICE)
    if practice.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_in_progress")

    answer = db.exec(
        select(ExamAnswer).where(
            ExamAnswer.session_id == session_id, ExamAnswer.question_id == question_id
        )
    ).first()
    if answer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="question_not_in_exam")
    if answer.verdict is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="answer_already_graded"
        )

    value = body.answer.strip()
    # There is no skipping in Practice: a question is answered, or it is left
    # behind when the Session ends. Marking an empty box wrong on the spot
    # would teach nothing and could not be taken back.
    if not value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="answer_required"
        )
    if answer.served_options and value not in answer.served_options:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="answer_not_offered"
        )
    # Refused rather than truncated: silently cutting a student's answer in
    # half and then grading what is left is the worse of the two.
    if len(value) > MAX_OPEN_ANSWER_CHARS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="answer_too_long"
        )

    question = db.get(Question, question_id)
    answer.answer = value

    if question.format != FORMAT_OPEN:
        answer.verdict = grade_closed(question, value)
    else:
        graded = await grade_open_answers(
            [
                OpenAnswerToGrade(
                    question_id=question_id,
                    question=question.text,
                    reference_answer=question.reference_answer,
                    player_answer=value,
                    subtype=question.open_subtype or SUBTYPE_CONCEPTUAL,
                )
            ],
            body.language,
        )
        verdict = graded.get(question_id)
        if verdict is not None:
            answer.verdict = VERDICT_CORRECT if verdict.acceptable else VERDICT_WRONG
            answer.explanation = verdict.explanation

    db.add(answer)
    db.commit()
    db.refresh(answer)

    # Nothing is revealed until the question is over, and the Verdict is what
    # makes it over. An answer the agent never read gives away nothing.
    marked = answer.verdict is not None
    return PracticeAnswerRead(
        question_id=question_id,
        answer=answer.answer,
        verdict=answer.verdict,
        correct_answer=question.reference_answer if marked else None,
        feedback=answer.explanation if marked else None,
    )


# ── POST /quiz/practice/{session_id}/finish ───────────────────────────────────

@router.post("/{session_id}/finish", response_model=SessionRead)
def finish_practice(
    session_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Ends the Session and records it.

    Always possible, and never a trap: a student who runs out of time after
    four questions ends on four questions, and is scored on those four. The
    Session is submitted, so it counts towards the Mastered rule — and it is a
    `practice` row, so it stays out of the Exam history."""
    practice = load_session(db, session_id, user_id, MODE_PRACTICE)
    if practice.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_in_progress")

    answers = load_answers(db, session_id)

    submitted_at = datetime.now(timezone.utc)
    started = practice.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)

    practice.status = STATUS_SUBMITTED
    practice.submitted_at = submitted_at
    practice.duration_seconds = max(0, int((submitted_at - started).total_seconds()))
    _settle_practice_score(practice, answers)
    db.add(practice)
    db.commit()
    db.refresh(practice)

    return read_session(practice, answers, load_questions(db, answers))


# ── POST /quiz/practice/{session_id}/abandon ──────────────────────────────────

@router.post("/{session_id}/abandon", response_model=SessionRead)
def abandon_practice(
    session_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Throws the Session away and frees the slot.

    Distinct from finishing: an abandoned Session has no score and no
    submission time, so it never reaches statistics. The answers already given
    stay on record, because what a player got wrong is worth keeping whatever
    became of the Session that asked it."""
    practice = load_session(db, session_id, user_id, MODE_PRACTICE)
    if practice.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_in_progress")

    practice.status = STATUS_ABANDONED
    db.add(practice)
    db.commit()
    db.refresh(practice)

    answers = load_answers(db, session_id)
    return read_session(practice, answers, load_questions(db, answers))
