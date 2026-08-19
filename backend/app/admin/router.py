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
from app.audit.model import (
    ENTITY_USER,
    FIELD_ACCOUNT_STATE,
    FIELD_PLAN,
    FIELD_ROLE,
    AuditLogEntry,
    AuditLogPage,
    AuditLogRead,
    record,
)
from app.auth.deps import get_current_admin
from app.database import get_session
from app.users.model import (
    ACCOUNT_STATE_SUSPENDED,
    ACCOUNT_STATES,
    PLANS,
    ROLE_ADMIN,
    ROLE_PLAYER,
    ROLES,
    AdminPlayerDetail,
    AdminPlayerListItem,
    AdminPlayerPage,
    AdminSetAccountStateRequest,
    AdminSetPlanRequest,
    AdminSetRoleRequest,
    AdminUserRead,
    User,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])

# The list only grows, so it is paged. The default is a screenful; the cap keeps
# a hand-typed `page_size` from asking for the whole table at once.
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# The distinct codes the self-guards return, so the interface can explain to an
# admin why an action on their own account was refused rather than show a bare
# 400. An admin locking themselves out or stripping their own role would leave
# a vacuum only the boot-time promotion could fill (ADR 0014); the panel refuses
# it outright and says which one it was.
CODE_CANNOT_SUSPEND_SELF = "cannot_suspend_self"
CODE_CANNOT_DEMOTE_SELF = "cannot_demote_self"


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


def _detail_for(db: Session, user: User) -> AdminPlayerDetail:
    """Build the detail response the mutation endpoints all return."""
    played = sessions_played_by_user(db, [user.id])
    activity = last_activity_by_user(db, [user])
    return AdminPlayerDetail(
        **_player_fields(user),
        last_activity=activity.get(user.id),
        sessions_played=played.get(user.id, 0),
    )


def _load_target(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return user


def _apply_change(
    db: Session,
    *,
    target: User,
    actor: User,
    field: str,
    new_value: str,
) -> None:
    """Set one axis and record the change, previous value beside new.

    A no-op change — setting a value to what it already holds — still writes an
    entry: the panel's honest answer to "what happened at this moment" includes
    the act, not only the transitions. The whole thing commits as one unit so a
    row can never move without its audit entry, nor an entry without its row.
    """
    previous_value = getattr(target, field)
    setattr(target, field, new_value)
    db.add(target)
    record(
        db,
        actor_id=actor.id,
        entity_type=ENTITY_USER,
        entity_id=target.id,
        field=field,
        previous_value=previous_value,
        new_value=new_value,
    )
    db.commit()
    db.refresh(target)


# ── Mutations: the four acts this slice records ───────────────────────────────

@router.put("/users/{user_id}/account-state", response_model=AdminPlayerDetail)
async def set_account_state(
    user_id: int,
    body: AdminSetAccountStateRequest,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Session = Depends(get_session),
):
    """Suspend or reinstate an account (#44).

    An admin cannot suspend themselves — it would leave the panel with no one
    able to reinstate but the boot-time promotion, and the refusal says so.
    """
    if body.account_state not in ACCOUNT_STATES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    target = _load_target(db, user_id)
    if target.id == admin.id and body.account_state == ACCOUNT_STATE_SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": CODE_CANNOT_SUSPEND_SELF},
        )

    _apply_change(
        db, target=target, actor=admin,
        field=FIELD_ACCOUNT_STATE, new_value=body.account_state,
    )
    return _detail_for(db, target)


@router.put("/users/{user_id}/role", response_model=AdminPlayerDetail)
async def set_role(
    user_id: int,
    body: AdminSetRoleRequest,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Session = Depends(get_session),
):
    """Change a player's role (#44).

    An admin cannot demote themselves out of admin — same vacuum, same refusal.
    """
    if body.role not in ROLES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    target = _load_target(db, user_id)
    if target.id == admin.id and body.role != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": CODE_CANNOT_DEMOTE_SELF},
        )

    _apply_change(
        db, target=target, actor=admin,
        field=FIELD_ROLE, new_value=body.role,
    )
    return _detail_for(db, target)


@router.put("/users/{user_id}/plan", response_model=AdminPlayerDetail)
async def set_plan(
    user_id: int,
    body: AdminSetPlanRequest,
    admin: Annotated[User, Depends(get_current_admin)],
    db: Session = Depends(get_session),
):
    """Change a player's Plan (#44).

    This changes no capability anywhere — `plan` is dormant (ADR 0014). It is
    stored, shown, editable and audited, and that is the whole of premium in
    this scope. There is no self-guard: an admin may change their own Plan
    freely, because it governs nothing.
    """
    if body.plan not in PLANS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    target = _load_target(db, user_id)
    _apply_change(
        db, target=target, actor=admin,
        field=FIELD_PLAN, new_value=body.plan,
    )
    return _detail_for(db, target)


# ── The audit log, readable and filterable ────────────────────────────────────

@router.get("/audit", response_model=AuditLogPage)
async def read_audit(
    db: Session = Depends(get_session),
    entity_type: Optional[str] = Query(default=None),
    entity_id: Optional[int] = Query(default=None),
    actor_id: Optional[int] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    """The panel's window on the audit log (#44).

    Filterable by entity — a kind, optionally narrowed to one row — and by
    actor, the two questions the panel asks of it: "everything that happened to
    this player" and "everything this admin did". Newest first, paged like the
    player list. Each row carries the acting admin's name and email so the
    screen need not resolve actor ids itself.
    """
    statement = select(AuditLogEntry)
    if entity_type is not None:
        statement = statement.where(AuditLogEntry.entity_type == entity_type)
    if entity_id is not None:
        statement = statement.where(AuditLogEntry.entity_id == entity_id)
    if actor_id is not None:
        statement = statement.where(AuditLogEntry.actor_id == actor_id)

    total = len(db.exec(statement).all())

    rows = db.exec(
        statement.order_by(AuditLogEntry.created_at.desc(), AuditLogEntry.id.desc())  # type: ignore[union-attr]
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    # Resolve the acting admins once for the page, not per row.
    actor_ids = {row.actor_id for row in rows}
    actors = {
        u.id: u
        for u in db.exec(select(User).where(User.id.in_(actor_ids))).all()  # type: ignore[union-attr]
    } if actor_ids else {}

    entries = []
    for row in rows:
        actor = actors.get(row.actor_id)
        entries.append(AuditLogRead(
            id=row.id,
            actor_id=row.actor_id,
            actor_email=actor.email if actor else None,
            actor_name=f"{actor.first_name} {actor.last_name}" if actor else None,
            created_at=row.created_at,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            field=row.field,
            previous_value=row.previous_value,
            new_value=row.new_value,
        ))

    return AuditLogPage(entries=entries, total=total, page=page, page_size=page_size)
