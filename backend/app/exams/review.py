"""Error Review — the mode that drills what this player, personally, keeps
getting wrong.

Practice asks the bank what a student at Level 2 ought to know. Error Review
asks the student's own record what they have not learned yet, and asks nothing
else. The pool is every question they have ever answered that is not yet
**Mastered**, and a question is Mastered after **three correct answers given in
three distinct Sessions** — three in a row inside one sitting is the same
memory used three times, and counts once.

Two consequences worth stating out loud, because they are the mode:

* There is **no Level and no format composition**. Both would be the game
  choosing the questions, and here the player's own history already has. What
  the pool holds is what gets served, in the order that is worth their time.
* The pool is **finite and shrinking**, which is the point. Emptying it is
  winning, so an empty pool is a screen the mode was designed to reach, not an
  error — and a pool smaller than the length asked for simply serves what
  exists rather than refusing.

Mastery is computed from the stored answers every time it is asked for, never
from a counter somebody increments (`service.mastery_counts`): a counter and a
history can disagree, and this cannot.
"""
import random
from typing import Annotated, Dict, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.auth.jwt import get_current_user_id
from app.database import get_session
from app.exams.model import (
    MASTERY_SESSIONS,
    MODE_REVIEW,
    REVIEW_LENGTHS,
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
    is_mastered,
    load_answers,
    load_questions,
    load_session,
    mark_answer,
    mastery_counts,
    read_session,
    serve_options,
)
from app.questions.model import Question

router = APIRouter(prefix="/quiz/review", tags=["quiz"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class StartReviewRequest(BaseModel):
    length: int


class ReviewAnswerRequest(BaseModel):
    answer: str
    # The agent writes its note to the player in the interface language; the
    # question and the reference answer are Italian whatever it says.
    language: str = "en"



class ReviewPoolRead(BaseModel):
    """How much is left to learn, before there is a Session to put it in.

    `pending` is the whole state of the mode: nothing else about Error Review
    can be decided without it, and a student is owed the number before they
    commit five minutes to it."""

    pending: int
    # The bar a question has to clear, so the screen can say "three sessions"
    # without hardcoding a rule that lives in the backend.
    mastery_sessions: int


class ReviewSessionRead(SessionRead):
    """A Session, plus the one thing this mode's screens need that the others
    do not: how many questions are still waiting to be Mastered, counted at the
    moment of asking. It is on every response rather than only the first
    because the number moves *during* the Session — that is what progress looks
    like here, and the student should be able to watch it."""

    pending: int


# ── The pool ──────────────────────────────────────────────────────────────────

def _pool(db: Session, user_id: int) -> Tuple[List[Question], Dict[int, Attempt], Dict[int, int]]:
    """Every question this player has answered that is not yet Mastered, with
    the history and the mastery counts it was decided from.

    "The player's questions" means the ones they have actually answered, in any
    mode and whatever became of the Session — an abandoned sitting still asked
    them, and getting one wrong there is exactly the mistake this mode is for.
    A question drawn but never reached is not one of theirs.

    Deactivated questions are excluded. A question withdrawn from the bank is
    withdrawn from everybody, including from the student who still owes it
    three right answers."""
    attempts = history(db, user_id)
    if not attempts:
        return [], attempts, {}

    mastery = mastery_counts(db, user_id)
    unmastered = [
        question_id
        for question_id in attempts
        if not is_mastered(mastery.get(question_id, 0))
    ]
    if not unmastered:
        return [], attempts, mastery

    questions = list(
        db.exec(
            select(Question).where(
                Question.active,  # type: ignore[arg-type]
                Question.id.in_(unmastered),  # type: ignore[attr-defined]
            )
        ).all()
    )
    return questions, attempts, mastery


def _order(
    pool: List[Question], attempts: Dict[int, Attempt], mastery: Dict[int, int]
) -> List[Question]:
    """The pool in the order worth the student's time: the ones they got wrong
    last time first, oldest mistake first, then everything else by how close it
    is to being Mastered — a question sitting on two correct Sessions is one
    good answer from leaving the pool for good, and getting it in front of them
    is the cheapest progress available."""
    # Shuffled first so that ties break randomly rather than by primary key:
    # two Sessions in a row must not open on the same question just because it
    # was inserted first.
    ordered = list(pool)
    random.shuffle(ordered)

    wrong = sorted(
        (q for q in ordered if attempts[q.id].verdict == VERDICT_WRONG),
        key=lambda q: attempts[q.id].seen_at,
    )
    rest = sorted(
        (q for q in ordered if attempts[q.id].verdict != VERDICT_WRONG),
        key=lambda q: (-mastery.get(q.id, 0), attempts[q.id].seen_at),
    )
    return wrong + rest


def _read_review(db: Session, user_id: int, exam: ExamSession, answers: List[ExamAnswer]):
    """A Session payload with the pool count recomputed. The count is derived
    on every read rather than stored, which is what keeps it honest while the
    Session it is being shown on is still changing it."""
    pool, _, _ = _pool(db, user_id)
    session = read_session(exam, answers, load_questions(db, answers))
    return ReviewSessionRead(**session.model_dump(), pending=len(pool))


# ── GET /quiz/review/pool ─────────────────────────────────────────────────────
# Declared before `/{session_id}` — routes match in the order they are written.

@router.get("/pool", response_model=ReviewPoolRead)
def get_review_pool(
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """How many questions are still waiting to be Mastered.

    Zero is a real answer and not an error: a player who has never answered
    anything and a player who has Mastered everything are both told nothing is
    waiting, and the screen says which of the two they are."""
    pool, _, _ = _pool(db, user_id)
    return ReviewPoolRead(pending=len(pool), mastery_sessions=MASTERY_SESSIONS)


# ── POST /quiz/review ─────────────────────────────────────────────────────────

@router.post("", status_code=201, response_model=ReviewSessionRead)
def start_review(
    body: StartReviewRequest,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Draws an Error Review Session from what this player has not Mastered.

    A pool smaller than the length asked for is served as it is — refusing to
    show a student their last four mistakes because they asked for ten would be
    absurd. An *empty* pool is refused, because there is no Session to draw;
    the screen turns that into the congratulation it is."""
    if body.length not in REVIEW_LENGTHS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="length_not_offered"
        )
    if in_progress_session(db, user_id) is not None:
        # The name predates the other modes: it is the game's one slot being
        # taken, whatever mode is holding it.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_in_progress")

    pool, attempts, mastery = _pool(db, user_id)
    if not pool:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="nothing_to_review"
        )

    drawn = _order(pool, attempts, mastery)[: body.length]
    random.shuffle(drawn)

    review = ExamSession(
        user_id=user_id,
        mode=MODE_REVIEW,
        # No Level: the pool spans whatever this player has answered, which is
        # the point of the mode and is not a setting.
        level=None,
        max_score=len(drawn),
    )
    db.add(review)
    db.flush()

    answers = [
        ExamAnswer(
            session_id=review.id,
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

    db.refresh(review)

    return _read_review(db, user_id, review, answers)


# ── GET /quiz/review/{session_id} ─────────────────────────────────────────────

@router.get("/{session_id}", response_model=ReviewSessionRead)
def get_review(
    session_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """The Session as it stands, with the corrections on the questions already
    marked and the pool count as it is right now."""
    review = load_session(db, session_id, user_id, MODE_REVIEW)
    return _read_review(db, user_id, review, load_answers(db, session_id))


# ── PUT /quiz/review/{session_id}/answers/{question_id} ───────────────────────

@router.put("/{session_id}/answers/{question_id}", response_model=MarkedAnswerRead)
async def answer_review_question(
    session_id: int,
    question_id: int,
    body: ReviewAnswerRequest,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Records one answer and marks it on the spot, exactly as Practice does —
    the feedback is immediate, and the rules are the shared ones in
    `service.mark_answer`.

    Note that answering correctly here does not move the question out of the
    pool on its own: mastery is counted in *submitted* Sessions, so the credit
    lands when the Session is finished."""
    review = load_session(db, session_id, user_id, MODE_REVIEW)
    return await mark_answer(db, review, question_id, body.answer, body.language)


# ── POST /quiz/review/{session_id}/finish ─────────────────────────────────────

@router.post("/{session_id}/finish", response_model=ReviewSessionRead)
def finish_review(
    session_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Ends the Session and records it. Submitting is what makes its correct
    answers count towards the Mastered rule, so the `pending` this returns is
    the first one that includes the work just done."""
    review = load_session(db, session_id, user_id, MODE_REVIEW)
    answers = finish_marked_session(db, review)
    return _read_review(db, user_id, review, answers)


# ── POST /quiz/review/{session_id}/abandon ────────────────────────────────────

@router.post("/{session_id}/abandon", response_model=ReviewSessionRead)
def abandon_review(
    session_id: int,
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
):
    """Throws the Session away and frees the slot. Nothing done in it counts
    towards mastery — but the questions it got wrong stay on record, so the
    pool it was drawn from is unchanged or larger, never smaller."""
    review = load_session(db, session_id, user_id, MODE_REVIEW)
    answers = abandon_open_session(db, review)
    return _read_review(db, user_id, review, answers)
