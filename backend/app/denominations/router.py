from typing import List
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.database import get_session
from app.denominations.model import Denomination, DenominationRead

router = APIRouter()


@router.get("/denominations", response_model=List[DenominationRead])
def list_denominations(session: Session = Depends(get_session)):
    return session.exec(select(Denomination)).all()
