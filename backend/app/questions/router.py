import random

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.auth.jwt import get_current_user_id
from app.database import get_session
from app.questions.model import Question, QuestionRead

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.get("/question", response_model=QuestionRead)
def get_question(
    _user_id: int = Depends(get_current_user_id),
    session: Session = Depends(get_session),
):
    """Serve one random active question, without its reference answer.

    Multiple-choice options are shuffled here rather than in the browser: in
    the source bank the correct answer is always the first option, so source
    order would give the answer away."""
    question = session.exec(
        select(Question).where(Question.active).order_by(func.random()).limit(1)
    ).first()

    if question is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No questions available"
        )

    options = list(question.options)
    random.shuffle(options)

    return QuestionRead(
        id=question.id,
        text=question.text,
        format=question.format,
        level=question.level,
        options=options,
        topic=question.topic,
    )
