"""Authenticated dependencies that load the user row.

The session token carries only the subject and an expiry (ADR 0014); it says
nothing about the three axes. So the truth about a user — whether the account
is suspended, whether it is an admin, which plan it holds — is read from the
database on every authenticated request, at the cost of one primary-key lookup,
in exchange for suspension and demotion taking effect on the next request
rather than up to a week later.
"""
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlmodel import Session

from app.auth.jwt import get_current_user_id
from app.database import get_session
from app.users.model import User


def get_current_user(
    user_id: Annotated[int, Depends(get_current_user_id)],
    db: Session = Depends(get_session),
) -> User:
    """Load the authenticated user's row, reading its three axes fresh."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user


def get_current_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Refuse everyone who is not an admin with a 403.

    A player who reaches an admin route is authenticated but not entitled: the
    honest answer is 403, not 401.
    """
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return user
