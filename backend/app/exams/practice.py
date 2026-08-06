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

Marking an answer as it is given, ending a Session and scoring it on what was
actually marked are shared with Error Review and live in `service.py`. What is
here is the draw, which is what makes this mode itself.
"""
import random
from typing import Annotated, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.auth.jwt import get_current_user_id
from app.database import get_session
from app.exams.model import (
    MODE_PRACTICE,
    PRACTICE_COMPOSITION,
    PRACTICE_LENGTHS,
    PRACTICE_LEVELS,
    VERDICT_WRONG,
    ExamAnswer,
    ExamSession,
)
from app.exams.service import (
    Attempt,
    MarkedAnswerRead,
    SessionRead,
    abandon_open_session,
    finish_marked_session,
    history,
    in_progress_session,
    load_answers,
    load_questions,
    load_session,
    mark_answer,
    read_session,
    serve_options,
)
from app.questions.model import Question

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


# The correction the screen shows, in the shape every mode that marks as it goes
# uses. Named here for the endpoint that returns it; the type is the shared one.
PracticeAnswerRead = MarkedAnswerRead


# ── Drawing the Session ───────────────────────────────────────────────────────

def _draw_adaptive(
    db: Session,
    user_id: int,
    question_format: str,
    level: int,
    count: int,
    attempts: Dict[int, Attempt],
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

    unseen = [q for q in candidates if q.id not in attempts]
    seen = [q for q in candidates if q.id in attempts]
    wrong = sorted(
        (q for q in seen if attempts[q.id].verdict == VERDICT_WRONG),
        key=lambda q: attempts[q.id].seen_at,
    )
    rest = sorted(
        (q for q in seen if attempts[q.id].verdict != VERDICT_WRONG),
        key=lambda q: attempts[q.id].seen_at,
    )

    return (unseen + wrong + rest)[:count]


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

    seen = history(db, user_id)
    drawn: List[Question] = []
    for question_format, count in PRACTICE_COMPOSITION[body.length].items():
        drawn.extend(
            _draw_adaptive(db, user_id, question_format, body.level, count, seen)
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
    """Records one answer and marks it on the spot — the whole reason the mode
    exists. The rules are shared with Error Review and live in
    `service.mark_answer`."""
    practice = load_session(db, session_id, user_id, MODE_PRACTICE)
    return await mark_answer(db, practice, question_id, body.answer, body.language)


# ── POST /quiz/practice/{session_id}/finish ───────────────────────────────────

@router.post("/{session_id}/finish", response_model=SessionRead)
def finish_practice(
    session_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Ends the Session and records it, scored on what was actually marked. The
    Session is submitted, so its correct answers count towards the Mastered
    rule — and it is a `practice` row, so it stays out of the Exam history."""
    practice = load_session(db, session_id, user_id, MODE_PRACTICE)
    answers = finish_marked_session(db, practice)
    return read_session(practice, answers, load_questions(db, answers))


# ── POST /quiz/practice/{session_id}/abandon ──────────────────────────────────

@router.post("/{session_id}/abandon", response_model=SessionRead)
def abandon_practice(
    session_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Throws the Session away and frees the slot, recording nothing."""
    practice = load_session(db, session_id, user_id, MODE_PRACTICE)
    answers = abandon_open_session(db, practice)
    return read_session(practice, answers, load_questions(db, answers))
