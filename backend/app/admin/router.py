"""The admin panel API.

Every route here is mounted behind `get_current_admin`, so a non-admin is
refused with a 403 before any handler runs. Every listing serialises a schema of
its own — never the raw `User` — so the password hash and the Google id cannot
leak, to anybody, admin included (ADR 0014).
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, func, or_, select

from app.admin.players import last_activity_by_user, sessions_played_by_user
from app.auth.deps import get_current_admin
from app.database import get_session
from app.users.model import (
    AdminPlayerDetail,
    AdminPlayerListItem,
    AdminPlayerPage,
    AdminUserRead,
    User,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])

# The list only grows, so it is paged. The default is a screenful; the cap keeps
# a hand-typed `page_size` from asking for the whole table at once.
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


@router.get("/whoami", response_model=AdminUserRead)
async def whoami(admin: Annotated[User, Depends(get_current_admin)]):
    """The shell's proof that the caller may open the panel.

    An admin reaches it; a player is refused with 403 by the router guard. The
    browser uses success here to decide it may render the panel rather than
    redirect away.
    """
    return admin


@router.get("/users", response_model=AdminPlayerPage)
async def list_users(
    db: Session = Depends(get_session),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    """The player list: every registered player, searchable and paged (#41).

    Free-text `search` matches name and email, case-insensitively, so an Admin
    can find one person among many. `total` is the count after that filter, so
    the screen can page through the result honestly.
    """
    statement = select(User)
    if search:
        term = f"%{search.strip().lower()}%"
        statement = statement.where(
            or_(
                func.lower(User.first_name).like(term),
                func.lower(User.last_name).like(term),
                func.lower(User.email).like(term),
            )
        )

    total = len(db.exec(statement).all())

    page_rows = db.exec(
        statement.order_by(User.created_at.desc(), User.id.desc())  # type: ignore[union-attr]
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    # Gather the two derived figures once for the whole page — a fixed handful of
    # queries however long the list grows — rather than per row.
    ids = [u.id for u in page_rows if u.id is not None]
    played = sessions_played_by_user(db, ids)
    activity = last_activity_by_user(db, page_rows)
    players = [
        AdminPlayerListItem(
            **_player_fields(user),
            last_activity=activity.get(user.id),
            sessions_played=played.get(user.id, 0),
        )
        for user in page_rows
    ]
    return AdminPlayerPage(
        players=players, total=total, page=page, page_size=page_size
    )


@router.get("/users/{user_id}", response_model=AdminPlayerDetail)
async def get_user(user_id: int, db: Session = Depends(get_session)):
    """One player's own page: the same facts, ready to carry actions later (#41)."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    played = sessions_played_by_user(db, [user_id])
    activity = last_activity_by_user(db, [user])
    return AdminPlayerDetail(
        **_player_fields(user),
        last_activity=activity.get(user_id),
        sessions_played=played.get(user_id, 0),
    )


def _player_fields(user: User) -> dict:
    """The safe axes and timestamps every admin player schema shares."""
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "account_state": user.account_state,
        "role": user.role,
        "plan": user.plan,
        "created_at": user.created_at,
        "last_login": user.last_login,
    }
