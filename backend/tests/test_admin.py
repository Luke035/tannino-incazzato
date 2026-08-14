import os

from fastapi.testclient import TestClient
from sqlmodel import Session, select

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

from app.users.model import ROLE_ADMIN, User  # noqa: E402
from app.sessions.model import GameSession  # noqa: E402
from app.exams.model import STATUS_ABANDONED, STATUS_SUBMITTED, ExamSession  # noqa: E402

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


def _admin_client(client: TestClient, session: Session) -> TestClient:
    client.post("/auth/register", json=ADMIN)
    _promote(session, ADMIN["email"])
    return client


def _add_player(session: Session, email: str, first: str = "Pat", last: str = "Player") -> User:
    user = User(email=email, first_name=first, last_name=last)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


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
    _admin_client(client, session)
    _add_player(session, PLAYER["email"], PLAYER["first_name"], PLAYER["last_name"])

    response = client.get("/admin/users")
    assert response.status_code == 200
    body = response.json()
    assert set(body) >= {"players", "total", "page", "page_size"}
    assert body["total"] == 2
    rows = body["players"]
    assert len(rows) == 2
    for row in rows:
        # The listing carries the axes, timestamps and the activity figures a
        # panel needs...
        assert set(row) >= {
            "id", "email", "first_name", "last_name",
            "account_state", "role", "plan", "created_at", "last_login",
            "last_activity", "sessions_played",
        }
        # ...and never the secrets, for anybody, admin included.
        assert "hashed_password" not in row
        assert "google_id" not in row


# ── The listing counts finished sessions and finds the most recent activity ──

def test_admin_users_counts_finished_sessions_across_both_games(
    client: TestClient, session: Session
):
    _admin_client(client, session)
    player = _add_player(session, PLAYER["email"])

    # Two finished wine-map games and one submitted exam count; an abandoned and
    # an in-progress exam do not.
    session.add(GameSession(
        user_id=player.id, game_id="wine-map", filter="both",
        score=1, max_score=1, duration_seconds=10,
    ))
    session.add(GameSession(
        user_id=player.id, game_id="wine-map", filter="both",
        score=1, max_score=1, duration_seconds=10,
    ))
    session.add(ExamSession(user_id=player.id, max_score=30, status=STATUS_SUBMITTED))
    session.add(ExamSession(user_id=player.id, max_score=30, status=STATUS_ABANDONED))
    session.commit()

    rows = client.get("/admin/users").json()["players"]
    counts = {row["email"]: row["sessions_played"] for row in rows}
    assert counts[PLAYER["email"]] == 3
    assert counts[ADMIN["email"]] == 0


# ── Search matches name and email ─────────────────────────────────────────────

def test_admin_users_search_matches_name_and_email(
    client: TestClient, session: Session
):
    _admin_client(client, session)
    _add_player(session, "alice@example.com", "Alice", "Rossi")
    _add_player(session, "bob@example.com", "Bob", "Bianchi")

    by_first = client.get("/admin/users", params={"search": "alice"}).json()
    assert by_first["total"] == 1
    assert by_first["players"][0]["email"] == "alice@example.com"

    by_last = client.get("/admin/users", params={"search": "bianchi"}).json()
    assert by_last["total"] == 1
    assert by_last["players"][0]["email"] == "bob@example.com"

    by_email = client.get("/admin/users", params={"search": "BOB@example"}).json()
    assert by_email["total"] == 1
    assert by_email["players"][0]["first_name"] == "Bob"


# ── Pagination pages the list ─────────────────────────────────────────────────

def test_admin_users_paginates(client: TestClient, session: Session):
    _admin_client(client, session)
    for i in range(5):
        _add_player(session, f"p{i}@example.com", f"Player{i}")

    first = client.get("/admin/users", params={"page": 1, "page_size": 2}).json()
    assert first["total"] == 6  # 5 players + the admin
    assert len(first["players"]) == 2
    assert first["page"] == 1

    second = client.get("/admin/users", params={"page": 2, "page_size": 2}).json()
    assert len(second["players"]) == 2
    first_ids = {r["id"] for r in first["players"]}
    second_ids = {r["id"] for r in second["players"]}
    assert first_ids.isdisjoint(second_ids)


# ── A player's own page ───────────────────────────────────────────────────────

def test_admin_user_detail_shows_the_same_facts(client: TestClient, session: Session):
    _admin_client(client, session)
    player = _add_player(session, PLAYER["email"], PLAYER["first_name"], PLAYER["last_name"])
    session.add(ExamSession(user_id=player.id, max_score=30, status=STATUS_SUBMITTED))
    session.commit()

    response = client.get(f"/admin/users/{player.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == PLAYER["email"]
    assert body["sessions_played"] == 1
    assert "hashed_password" not in body
    assert "google_id" not in body


def test_admin_user_detail_404_for_an_unknown_player(
    client: TestClient, session: Session
):
    _admin_client(client, session)
    assert client.get("/admin/users/999999").status_code == 404


def test_admin_user_detail_refuses_a_player_with_403(client: TestClient):
    client.post("/auth/register", json=PLAYER)
    assert client.get("/admin/users/1").status_code == 403
