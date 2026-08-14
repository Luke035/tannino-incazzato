"""The admin panel API.

Every route here is mounted behind `get_current_admin`, so a non-admin is
refused with a 403 before any handler runs. The listing serialises
`AdminUserRead` — a schema of its own, never the raw `User` — so the password
hash and the Google id cannot leak, to anybody, admin included (ADR 0014).
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.auth.deps import get_current_admin
from app.database import get_session
from app.users.model import AdminUserRead, User

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


@router.get("/whoami", response_model=AdminUserRead)
async def whoami(admin: Annotated[User, Depends(get_current_admin)]):
    """The shell's proof that the caller may open the panel.

    An admin reaches it; a player is refused with 403 by the router guard. The
    browser uses success here to decide it may render the panel rather than
    redirect away.
    """
    return admin


@router.get("/users", response_model=list[AdminUserRead])
async def list_users(db: Session = Depends(get_session)):
    """The admin listing, on its own response schema."""
    return db.exec(select(User).order_by(User.id)).all()
