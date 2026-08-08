from typing import Annotated, List
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.auth.jwt import get_current_user_id
from app.database import get_session
from app.denominations.model import Denomination, DenominationRead

router = APIRouter()


@router.get("/denominations", response_model=List[DenominationRead])
def list_denominations(
    user_id: Annotated[int, Depends(get_current_user_id)],
    session: Session = Depends(get_session),
):
    return session.exec(select(Denomination)).all()
