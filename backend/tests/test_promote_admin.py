"""Behavioural tests for backend/scripts/promote_admin.py.

Exercises `promote_admin()` against the SQLite `session` fixture — `main()` only
adds engine creation and the Postgres advisory lock, neither meaningful to
unit-test on SQLite (same split as the other script tests).

Covers the promotion in all three states named by the acceptance criteria:
promotes into a vacuum, is a no-op when an admin already exists, and does not
create a user that has not registered.
"""
import sys
from pathlib import Path

from sqlmodel import Session, select

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from promote_admin import promote_admin  # noqa: E402

from app.users.model import ROLE_ADMIN, ROLE_PLAYER, User  # noqa: E402


def _add(session: Session, email: str, role: str = ROLE_PLAYER) -> User:
    user = User(email=email, first_name="F", last_name="L", role=role)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


# ── State 1: promotes into a vacuum ───────────────────────────────────────────

def test_promotes_the_configured_email_when_no_admin_exists(session: Session):
    _add(session, "boss@example.com")

    result = promote_admin(session, "boss@example.com")

    assert result.promoted_email == "boss@example.com"
    promoted = session.exec(
        select(User).where(User.email == "boss@example.com")
    ).first()
    assert promoted.role == ROLE_ADMIN


# ── State 2: no-op when an admin already exists ───────────────────────────────

def test_is_a_no_op_on_re_run(session: Session):
    _add(session, "boss@example.com")
    promote_admin(session, "boss@example.com")

    result = promote_admin(session, "boss@example.com")

    assert result.admin_exists is True
    assert result.promoted_email is None


def test_does_not_promote_when_a_different_admin_already_exists(session: Session):
    # An admin was created in the panel (or by an earlier boot's email). The
    # bootstrap fills a vacuum; it never overrides that decision.
    _add(session, "someone@example.com", role=ROLE_ADMIN)
    _add(session, "boss@example.com")

    result = promote_admin(session, "boss@example.com")

    assert result.admin_exists is True
    boss = session.exec(
        select(User).where(User.email == "boss@example.com")
    ).first()
    assert boss.role == ROLE_PLAYER  # untouched


# ── State 3: does not create a user that has not registered ───────────────────

def test_does_not_create_an_unregistered_user(session: Session):
    result = promote_admin(session, "ghost@example.com")

    assert result.unregistered_email == "ghost@example.com"
    assert session.exec(
        select(User).where(User.email == "ghost@example.com")
    ).first() is None


# ── No email configured ───────────────────────────────────────────────────────

def test_does_nothing_when_no_email_configured(session: Session):
    _add(session, "boss@example.com")

    result = promote_admin(session, None)

    assert result.no_email_configured is True
    boss = session.exec(
        select(User).where(User.email == "boss@example.com")
    ).first()
    assert boss.role == ROLE_PLAYER
