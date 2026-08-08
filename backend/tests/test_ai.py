import os
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

REGISTER_PAYLOAD = {
    "email": "ai-test@example.com",
    "password": "securepassword",
    "first_name": "Test",
    "last_name": "User",
}

HINT_PAYLOAD = {
    "denominationName": "Barolo",
    "denominationType": "DOCG",
    "wrongRegion": "Veneto",
    "correctRegions": ["Piemonte"],
    "remainingRegions": ["Piemonte"],
    "attemptNumber": 1,
    "language": "en",
}

MEMORIZE_PAYLOAD = {
    "denominationName": "Barolo",
    "denominationType": "DOCG",
    "correctRegions": ["Piemonte"],
    "language": "en",
}

REVIEW_PAYLOAD = {
    "history": [
        {
            "name": "Barolo",
            "type": "DOCG",
            "correctRegions": ["Piemonte"],
            "wrongAttempts": 1,
            "result": "correct",
        }
    ],
    "language": "en",
}


def _register(client: TestClient) -> TestClient:
    client.post("/auth/register", json=REGISTER_PAYLOAD)
    return client


def test_hint_returns_hint(client):
    _register(client)
    with patch("app.ai.router.generate_hint", new=AsyncMock(return_value="Think mountains and truffles.")):
        response = client.post("/hint", json=HINT_PAYLOAD)
    assert response.status_code == 200
    assert response.json() == {"hint": "Think mountains and truffles."}


def test_hint_missing_field_returns_422(client):
    _register(client)
    payload = {k: v for k, v in HINT_PAYLOAD.items() if k != "wrongRegion"}
    response = client.post("/hint", json=payload)
    assert response.status_code == 422


def test_hint_returns_401_without_auth(client):
    response = client.post("/hint", json=HINT_PAYLOAD)
    assert response.status_code == 401


def test_memorize_returns_tip(client):
    _register(client)
    with patch("app.ai.router.generate_memorize_tip", new=AsyncMock(return_value="Barolo is king of Piemonte.")):
        response = client.post("/memorize", json=MEMORIZE_PAYLOAD)
    assert response.status_code == 200
    assert response.json() == {"tip": "Barolo is king of Piemonte."}


def test_memorize_returns_401_without_auth(client):
    response = client.post("/memorize", json=MEMORIZE_PAYLOAD)
    assert response.status_code == 401


def test_review_returns_review(client):
    _register(client)
    with patch("app.ai.router.generate_review", new=AsyncMock(return_value="Good session overall.")):
        response = client.post("/review", json=REVIEW_PAYLOAD)
    assert response.status_code == 200
    assert response.json() == {"review": "Good session overall."}


def test_review_returns_401_without_auth(client):
    response = client.post("/review", json=REVIEW_PAYLOAD)
    assert response.status_code == 401
