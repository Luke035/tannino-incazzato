import os

from fastapi.testclient import TestClient
from sqlmodel import Session, select

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

from app.users.model import ROLE_ADMIN, User  # noqa: E402

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


def _promote(session: Session, email: str) -> None:
    user = session.exec(select(User).where(User.email == email)).first()
    user.role = ROLE_ADMIN
    session.add(user)
    session.commit()


# ── The panel refuses a non-admin ─────────────────────────────────────────────

def test_admin_whoami_refuses_a_player_with_403(client: TestClient):
    client.post("/auth/register", json=PLAYER)  # logs the player in
    response = client.get("/admin/whoami")
    assert response.status_code == 403


def test_admin_users_refuses_a_player_with_403(client: TestClient):
    client.post("/auth/register", json=PLAYER)
    response = client.get("/admin/users")
    assert response.status_code == 403


def test_admin_endpoints_refuse_the_anonymous_with_401(client: TestClient):
    # No cookie at all is unauthenticated, not merely unentitled.
    assert client.get("/admin/whoami").status_code == 401
    assert client.get("/admin/users").status_code == 401


# ── The panel admits an admin ─────────────────────────────────────────────────

def test_admin_whoami_admits_an_admin(client: TestClient, session: Session):
    client.post("/auth/register", json=ADMIN)
    _promote(session, ADMIN["email"])
    response = client.get("/admin/whoami")
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_admin_users_lists_on_its_own_schema_without_secrets(
    client: TestClient, session: Session
):
    client.post("/auth/register", json=ADMIN)
    client_other = client  # same client; register a second user too
    _promote(session, ADMIN["email"])
    # Register a plain player via the DB so the listing has two rows.
    session.add(
        User(
            email=PLAYER["email"],
            first_name=PLAYER["first_name"],
            last_name=PLAYER["last_name"],
        )
    )
    session.commit()

    response = client_other.get("/admin/users")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 2
    for row in rows:
        # The admin listing carries the axes and timestamps a panel needs...
        assert set(row) >= {
            "id", "email", "first_name", "last_name",
            "account_state", "role", "plan", "created_at", "last_login",
        }
        # ...and never the secrets, for anybody, admin included.
        assert "hashed_password" not in row
        assert "google_id" not in row
