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

# The distinct code a game endpoint returns when it refuses a suspended player.
# It is deliberately its own string — not a bare 403 — so the interface can tell
# "your account is suspended" apart from every other reason a game might refuse,
# above all a game taken offline for maintenance, whose message is the same
# pixels with the opposite meaning (#44). The status is 403: the caller is
# authenticated and identified, but not permitted to play.
ACCOUNT_SUSPENDED_CODE = "account_suspended"


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


def require_active_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Refuse a suspended player, and only a suspended player.

    This is the one dependency the game routers mount (ADR 0014): sessions,
    exams, practice, review, quiz statistics and the AI endpoints. It is
    deliberately *not* mounted on the calls that identify a player — `/auth/me`,
    the profile, past results — so a suspended player still signs in, still
    reaches the home screen, and is told what happened rather than dropped at a
    login screen with no explanation.

    The refusal carries a distinct code so the interface can grey a game with
    "your account is suspended" and never confuse it with a game offline for
    maintenance. Every new game router mounts this; it is never written endpoint
    by endpoint.
    """
    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": ACCOUNT_SUSPENDED_CODE},
        )
    return user
