"""Account state, role and Plan: enforced immediately and audited (#44).

These tests pin the four promises of the slice:

- A suspended player is refused by every game router with a distinct code, yet
  still reads their own identity — the games bite, the login does not.
- Suspension takes effect on the very next request, without a new session.
- An admin cannot suspend or demote themselves, and is told which it was.
- Every act writes an audit entry carrying the value that was there before it,
  readable in the panel and filterable by entity and by actor.
"""
import os

from fastapi.testclient import TestClient
from sqlmodel import Session, select

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

from app.audit.model import AuditLogEntry  # noqa: E402
from app.auth.deps import ACCOUNT_SUSPENDED_CODE  # noqa: E402
from app.users.model import (  # noqa: E402
    ACCOUNT_STATE_OPEN,
    ACCOUNT_STATE_SUSPENDED,
    PLAN_PREMIUM,
    ROLE_ADMIN,
    ROLE_PLAYER,
    User,
)

PLAYER = {
    "email": "player@example.com",
    "password": "securepassword",
    "first_name": "Piero",
    "last_name": "Giocatore",
}
ADMIN = {
    "email": "admin@example.com",
    "password": "securepassword",
    "first_name": "Ada",
    "last_name": "Amministratrice",
}

# Every game router the refusal is mounted on, one representative call each. A
# GET is enough to reach the mounted dependency, which runs before the handler.
GAME_ENDPOINTS = [
    ("get", "/session/stats"),
    ("get", "/quiz/exams/current"),
    ("get", "/quiz/practice/1"),
    ("get", "/quiz/review/pool"),
    ("get", "/quiz/stats"),
    ("post", "/hint"),
]


def _promote(session: Session, email: str) -> None:
    user = session.exec(select(User).where(User.email == email)).first()
    user.role = ROLE_ADMIN
    session.add(user)
    session.commit()


def _admin_client(client: TestClient, session: Session) -> User:
    client.post("/auth/register", json=ADMIN)
    _promote(session, ADMIN["email"])
    return session.exec(select(User).where(User.email == ADMIN["email"])).first()


def _suspend(session: Session, email: str) -> None:
    user = session.exec(select(User).where(User.email == email)).first()
    user.account_state = ACCOUNT_STATE_SUSPENDED
    session.add(user)
    session.commit()


# ── A suspended player is refused by every game, but still reads their identity ─

def test_a_suspended_player_is_refused_by_every_game_with_the_distinct_code(
    client: TestClient, session: Session
):
    client.post("/auth/register", json=PLAYER)  # registers and logs in
    _suspend(session, PLAYER["email"])

    for method, path in GAME_ENDPOINTS:
        response = getattr(client, method)(path)
        assert response.status_code == 403, f"{path} did not refuse"
        assert response.json()["detail"]["code"] == ACCOUNT_SUSPENDED_CODE, path


def test_a_suspended_player_still_reads_their_own_identity(
    client: TestClient, session: Session
):
    client.post("/auth/register", json=PLAYER)
    _suspend(session, PLAYER["email"])

    # The call that identifies them must not be refused — otherwise they land at
    # a login screen with no idea what happened.
    response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == PLAYER["email"]
    assert response.json()["account_state"] == ACCOUNT_STATE_SUSPENDED


def test_an_open_player_still_reaches_the_games(client: TestClient):
    # The refusal is only for the suspended: an open player is untouched.
    client.post("/auth/register", json=PLAYER)
    assert client.get("/session/stats").status_code == 200


# ── Suspension takes effect on the very next request ──────────────────────────

def test_suspension_takes_effect_on_the_next_request_without_a_new_session(
    client: TestClient, session: Session
):
    client.post("/auth/register", json=PLAYER)
    # The same cookie that just worked...
    assert client.get("/session/stats").status_code == 200

    _suspend(session, PLAYER["email"])

    # ...is refused on the next request, no re-login: the axes are read from the
    # row, not the token.
    refused = client.get("/session/stats")
    assert refused.status_code == 403
    assert refused.json()["detail"]["code"] == ACCOUNT_SUSPENDED_CODE


# ── The self-guards ───────────────────────────────────────────────────────────

def test_an_admin_cannot_suspend_themselves(client: TestClient, session: Session):
    admin = _admin_client(client, session)
    response = client.put(
        f"/admin/users/{admin.id}/account-state",
        json={"account_state": ACCOUNT_STATE_SUSPENDED},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "cannot_suspend_self"
    # And nothing changed.
    session.refresh(admin)
    assert admin.account_state == ACCOUNT_STATE_OPEN


def test_an_admin_cannot_demote_themselves(client: TestClient, session: Session):
    admin = _admin_client(client, session)
    response = client.put(
        f"/admin/users/{admin.id}/role",
        json={"role": ROLE_PLAYER},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "cannot_demote_self"
    session.refresh(admin)
    assert admin.role == ROLE_ADMIN


def test_an_admin_may_reinstate_themselves_and_change_their_own_plan(
    client: TestClient, session: Session
):
    # The guards are narrow: only suspend-self and demote-self. Reinstating self
    # and changing own Plan are fine.
    admin = _admin_client(client, session)
    assert client.put(
        f"/admin/users/{admin.id}/account-state",
        json={"account_state": ACCOUNT_STATE_OPEN},
    ).status_code == 200
    assert client.put(
        f"/admin/users/{admin.id}/plan",
        json={"plan": PLAN_PREMIUM},
    ).status_code == 200


# ── The four acts work on another player ──────────────────────────────────────

def _add_player(session: Session, email: str = PLAYER["email"]) -> User:
    user = User(email=email, first_name="Pat", last_name="Player")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_an_admin_suspends_and_reinstates_a_player(client: TestClient, session: Session):
    _admin_client(client, session)
    player = _add_player(session)

    suspended = client.put(
        f"/admin/users/{player.id}/account-state",
        json={"account_state": ACCOUNT_STATE_SUSPENDED},
    )
    assert suspended.status_code == 200
    assert suspended.json()["account_state"] == ACCOUNT_STATE_SUSPENDED

    reinstated = client.put(
        f"/admin/users/{player.id}/account-state",
        json={"account_state": ACCOUNT_STATE_OPEN},
    )
    assert reinstated.json()["account_state"] == ACCOUNT_STATE_OPEN


def test_an_admin_changes_role_and_plan(client: TestClient, session: Session):
    _admin_client(client, session)
    player = _add_player(session)

    assert client.put(
        f"/admin/users/{player.id}/role", json={"role": ROLE_ADMIN}
    ).json()["role"] == ROLE_ADMIN
    assert client.put(
        f"/admin/users/{player.id}/plan", json={"plan": PLAN_PREMIUM}
    ).json()["plan"] == PLAN_PREMIUM


def test_an_unknown_value_is_refused(client: TestClient, session: Session):
    _admin_client(client, session)
    player = _add_player(session)
    assert client.put(
        f"/admin/users/{player.id}/account-state", json={"account_state": "frozen"}
    ).status_code == 422
    assert client.put(
        f"/admin/users/{player.id}/role", json={"role": "wizard"}
    ).status_code == 422
    assert client.put(
        f"/admin/users/{player.id}/plan", json={"plan": "platinum"}
    ).status_code == 422


def test_a_player_cannot_mutate_anyone(client: TestClient, session: Session):
    client.post("/auth/register", json=PLAYER)
    assert client.put(
        "/admin/users/1/account-state", json={"account_state": ACCOUNT_STATE_SUSPENDED}
    ).status_code == 403


def test_mutating_an_unknown_player_is_404(client: TestClient, session: Session):
    _admin_client(client, session)
    assert client.put(
        "/admin/users/999999/role", json={"role": ROLE_ADMIN}
    ).status_code == 404


# ── The audit captures the value that was there before ────────────────────────

def test_each_act_writes_an_audit_entry_with_prior_and_new_value(
    client: TestClient, session: Session
):
    admin = _admin_client(client, session)
    player = _add_player(session)

    client.put(
        f"/admin/users/{player.id}/account-state",
        json={"account_state": ACCOUNT_STATE_SUSPENDED},
    )
    client.put(f"/admin/users/{player.id}/role", json={"role": ROLE_ADMIN})
    client.put(f"/admin/users/{player.id}/plan", json={"plan": PLAN_PREMIUM})

    entries = session.exec(
        select(AuditLogEntry).order_by(AuditLogEntry.id)
    ).all()
    assert len(entries) == 3

    by_field = {e.field: e for e in entries}
    assert by_field["account_state"].previous_value == ACCOUNT_STATE_OPEN
    assert by_field["account_state"].new_value == ACCOUNT_STATE_SUSPENDED
    assert by_field["role"].previous_value == ROLE_PLAYER
    assert by_field["role"].new_value == ROLE_ADMIN
    assert by_field["plan"].previous_value == "free"
    assert by_field["plan"].new_value == PLAN_PREMIUM

    for entry in entries:
        assert entry.actor_id == admin.id
        assert entry.entity_type == "user"
        assert entry.entity_id == player.id
        assert entry.created_at is not None


# ── The audit is readable and filterable ──────────────────────────────────────

def test_the_audit_is_readable_and_filterable_by_entity_and_actor(
    client: TestClient, session: Session
):
    admin = _admin_client(client, session)
    alice = _add_player(session, "alice@example.com")
    bob = _add_player(session, "bob@example.com")

    client.put(f"/admin/users/{alice.id}/plan", json={"plan": PLAN_PREMIUM})
    client.put(f"/admin/users/{bob.id}/role", json={"role": ROLE_ADMIN})

    # Everything, newest first.
    everything = client.get("/admin/audit").json()
    assert everything["total"] == 2

    # Filter by a single entity (one player).
    just_alice = client.get(
        "/admin/audit", params={"entity_type": "user", "entity_id": alice.id}
    ).json()
    assert just_alice["total"] == 1
    assert just_alice["entries"][0]["field"] == "plan"
    assert just_alice["entries"][0]["entity_id"] == alice.id

    # Filter by actor — everything this admin did.
    by_actor = client.get(
        "/admin/audit", params={"actor_id": admin.id}
    ).json()
    assert by_actor["total"] == 2
    # Each row carries the acting admin's name and email.
    row = by_actor["entries"][0]
    assert row["actor_email"] == ADMIN["email"]
    assert row["actor_name"] == "Ada Amministratrice"


def test_the_audit_refuses_a_non_admin(client: TestClient):
    client.post("/auth/register", json=PLAYER)
    assert client.get("/admin/audit").status_code == 403


def test_the_audit_records_a_no_op_change(client: TestClient, session: Session):
    # Setting a value to what it already holds is still an act worth recording.
    _admin_client(client, session)
    player = _add_player(session)
    client.put(f"/admin/users/{player.id}/plan", json={"plan": "free"})
    entries = session.exec(select(AuditLogEntry)).all()
    assert len(entries) == 1
    assert entries[0].previous_value == "free"
    assert entries[0].new_value == "free"
