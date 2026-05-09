import os
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

REGISTER_PAYLOAD = {
    "email": "test@example.com",
    "password": "securepassword",
    "first_name": "Luca",
    "last_name": "Rossi",
}


# ── Register ──────────────────────────────────────────────────────────────────

def test_register_success(client: TestClient):
    response = client.post("/auth/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == REGISTER_PAYLOAD["email"]
    assert data["first_name"] == "Luca"
    assert data["last_name"] == "Rossi"
    assert "id" in data
    assert "hashed_password" not in data
    assert response.cookies.get("sommelier_session") is not None


def test_register_duplicate_email_returns_409(client: TestClient):
    client.post("/auth/register", json=REGISTER_PAYLOAD)
    response = client.post("/auth/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 409
    assert response.json()["detail"] == "email_exists"


# ── Login ─────────────────────────────────────────────────────────────────────

def test_login_success(client: TestClient):
    client.post("/auth/register", json=REGISTER_PAYLOAD)
    response = client.post(
        "/auth/login",
        json={"email": REGISTER_PAYLOAD["email"], "password": REGISTER_PAYLOAD["password"]},
    )
    assert response.status_code == 200
    assert response.cookies.get("sommelier_session") is not None


def test_login_wrong_password_returns_401(client: TestClient):
    client.post("/auth/register", json=REGISTER_PAYLOAD)
    response = client.post(
        "/auth/login",
        json={"email": REGISTER_PAYLOAD["email"], "password": "wrong"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_credentials"


def test_login_unknown_email_returns_401(client: TestClient):
    response = client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "irrelevant"},
    )
    assert response.status_code == 401


# ── /me ───────────────────────────────────────────────────────────────────────

def test_me_returns_user_when_logged_in(client: TestClient):
    client.post("/auth/register", json=REGISTER_PAYLOAD)
    response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == REGISTER_PAYLOAD["email"]


def test_me_returns_401_without_cookie(client: TestClient):
    response = client.get("/auth/me")
    assert response.status_code == 401


# ── Logout ────────────────────────────────────────────────────────────────────

def test_logout_clears_cookie(client: TestClient):
    client.post("/auth/register", json=REGISTER_PAYLOAD)
    assert client.cookies.get("sommelier_session") is not None

    client.post("/auth/logout")
    response = client.get("/auth/me")
    assert response.status_code == 401
