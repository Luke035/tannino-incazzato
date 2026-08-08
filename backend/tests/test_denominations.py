import os

from fastapi.testclient import TestClient
from sqlmodel import Session
from app.denominations.model import Denomination

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

REGISTER_PAYLOAD = {
    "email": "denominations-test@example.com",
    "password": "securepassword",
    "first_name": "Test",
    "last_name": "User",
}


def _register(client: TestClient) -> TestClient:
    client.post("/auth/register", json=REGISTER_PAYLOAD)
    return client


def test_list_denominations_empty(client):
    _register(client)
    response = client.get("/denominations")
    assert response.status_code == 200
    assert response.json() == []


def test_list_denominations_returns_all(client, session: Session):
    _register(client)
    session.add(Denomination(name="Prosecco", type="DOC", regions=["Veneto", "Friuli Venezia Giulia"]))
    session.add(Denomination(name="Barolo", type="DOCG", regions=["Piemonte"]))
    session.commit()

    response = client.get("/denominations")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


def test_denomination_shape(client, session: Session):
    _register(client)
    session.add(Denomination(name="Barolo", type="DOCG", regions=["Piemonte"]))
    session.commit()

    response = client.get("/denominations")
    item = response.json()[0]
    assert set(item.keys()) == {"id", "name", "type", "regions"}
    assert item["name"] == "Barolo"
    assert item["type"] == "DOCG"
    assert item["regions"] == ["Piemonte"]
    assert isinstance(item["id"], int)


def test_list_denominations_returns_401_without_auth(client):
    response = client.get("/denominations")
    assert response.status_code == 401
