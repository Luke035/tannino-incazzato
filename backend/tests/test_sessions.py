import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

REGISTER_PAYLOAD = {
    "email": "session-test@example.com",
    "password": "securepassword",
    "first_name": "Test",
    "last_name": "User",
}

STARTED_AT = (datetime.now(timezone.utc) - timedelta(minutes=12)).isoformat()

HISTORY_CORRECT = [
    {
        "denominationName": "Barolo",
        "denominationType": "DOCG",
        "wrongAttempts": 0,
        "result": "correct",
        "foundRegions": ["piemonte"],
        "autoPlacedRegions": [],
    },
    {
        "denominationName": "Soave",
        "denominationType": "DOC",
        "wrongAttempts": 1,
        "result": "correct",
        "foundRegions": ["veneto"],
        "autoPlacedRegions": [],
    },
    {
        "denominationName": "Vernaccia di San Gimignano",
        "denominationType": "DOCG",
        "wrongAttempts": 3,
        "result": "auto-placed",
        "foundRegions": [],
        "autoPlacedRegions": ["tuscany"],
    },
]

SESSION_PAYLOAD = {
    "gameId": "mappa-vini",
    "filter": "both",
    "startedAt": STARTED_AT,
    "history": HISTORY_CORRECT,
}


def _register_and_get_client(client: TestClient) -> TestClient:
    client.post("/auth/register", json=REGISTER_PAYLOAD)
    return client


# ── POST /session ─────────────────────────────────────────────────────────────

def test_save_session_returns_201_with_id(client: TestClient):
    _register_and_get_client(client)
    response = client.post("/session", json=SESSION_PAYLOAD)
    assert response.status_code == 201
    assert "id" in response.json()


def test_save_session_computes_score_correctly(client: TestClient):
    _register_and_get_client(client)
    client.post("/session", json=SESSION_PAYLOAD)
    stats = client.get("/session/stats").json()
    # Barolo: 0 wrong → 3pts, Soave: 1 wrong → 2pts, Vernaccia: auto-placed → 0pts = 5/9
    assert stats["aggregate"]["best_score_pct"] == pytest.approx(5 / 9 * 100, abs=0.2)


def test_save_session_persists_card_attempts(client: TestClient):
    _register_and_get_client(client)
    client.post("/session", json=SESSION_PAYLOAD)
    stats = client.get("/session/stats").json()
    assert stats["sessions"][0]["items"] == 3


def test_save_session_computes_duration(client: TestClient):
    _register_and_get_client(client)
    client.post("/session", json=SESSION_PAYLOAD)
    stats = client.get("/session/stats").json()
    # started ~12 minutes ago, so duration should be close to 720s
    assert stats["sessions"][0]["duration_seconds"] >= 700


def test_save_session_returns_401_without_auth(client: TestClient):
    response = client.post("/session", json=SESSION_PAYLOAD, cookies={})
    # Clear cookies to simulate unauthenticated request
    old_cookies = client.cookies.jar._cookies.copy()  # type: ignore[attr-defined]
    client.cookies.clear()
    response = client.post("/session", json=SESSION_PAYLOAD)
    assert response.status_code == 401
    # Restore
    for domain, paths in old_cookies.items():
        for path, cookies in paths.items():
            for name, cookie in cookies.items():
                client.cookies.set(name, cookie.value)


def test_save_session_rejects_empty_history(client: TestClient):
    _register_and_get_client(client)
    response = client.post("/session", json={**SESSION_PAYLOAD, "history": []})
    assert response.status_code == 422


# ── GET /session/stats ────────────────────────────────────────────────────────

def test_stats_empty_state_for_new_user(client: TestClient):
    _register_and_get_client(client)
    response = client.get("/session/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["aggregate"]["total_sessions"] == 0
    assert data["aggregate"]["unique_denoms"] == 0
    assert data["sessions"] == []
    assert data["top_regions"] == []
    assert data["low_regions"] == []


def test_stats_returns_401_without_auth(client: TestClient):
    client.cookies.clear()
    response = client.get("/session/stats")
    assert response.status_code == 401


def test_stats_aggregate_after_one_session(client: TestClient):
    _register_and_get_client(client)
    client.post("/session", json=SESSION_PAYLOAD)
    data = client.get("/session/stats").json()
    agg = data["aggregate"]
    assert agg["total_sessions"] == 1
    assert agg["unique_denoms"] == 3
    assert agg["best_score_pct"] == agg["avg_score_pct"]


def test_stats_unique_denoms_across_sessions(client: TestClient):
    _register_and_get_client(client)
    client.post("/session", json=SESSION_PAYLOAD)
    # Second session with one overlapping denom (Barolo) + one new (Chianti)
    second_history = [
        {
            "denominationName": "Barolo",
            "denominationType": "DOCG",
            "wrongAttempts": 0,
            "result": "correct",
            "foundRegions": ["piemonte"],
            "autoPlacedRegions": [],
        },
        {
            "denominationName": "Chianti",
            "denominationType": "DOCG",
            "wrongAttempts": 0,
            "result": "correct",
            "foundRegions": ["tuscany"],
            "autoPlacedRegions": [],
        },
    ]
    client.post("/session", json={**SESSION_PAYLOAD, "history": second_history})
    data = client.get("/session/stats").json()
    assert data["aggregate"]["unique_denoms"] == 4  # Barolo, Soave, Vernaccia, Chianti


def test_stats_type_performance_aggregates_per_card(client: TestClient):
    _register_and_get_client(client)
    client.post("/session", json=SESSION_PAYLOAD)
    data = client.get("/session/stats").json()
    tp = data["type_performance"]
    # DOCG: Barolo 3/3=100%, Vernaccia 0/3=0% → avg 50%
    assert tp["docg_pct"] == pytest.approx(50.0, abs=0.2)
    # DOC: Soave 2/3=66.7%
    assert tp["doc_pct"] == pytest.approx(66.7, abs=0.2)


def test_stats_region_performance_formula(client: TestClient):
    _register_and_get_client(client)
    # Two sessions: piemonte correct twice, tuscany correct once + auto-placed once
    history_1 = [
        {
            "denominationName": "Barolo",
            "denominationType": "DOCG",
            "wrongAttempts": 0,
            "result": "correct",
            "foundRegions": ["piemonte"],
            "autoPlacedRegions": [],
        },
    ]
    history_2 = [
        {
            "denominationName": "Barolo",
            "denominationType": "DOCG",
            "wrongAttempts": 0,
            "result": "correct",
            "foundRegions": ["piemonte"],
            "autoPlacedRegions": [],
        },
        {
            "denominationName": "Vernaccia di San Gimignano",
            "denominationType": "DOCG",
            "wrongAttempts": 3,
            "result": "auto-placed",
            "foundRegions": [],
            "autoPlacedRegions": ["tuscany"],
        },
        {
            "denominationName": "Chianti",
            "denominationType": "DOCG",
            "wrongAttempts": 0,
            "result": "correct",
            "foundRegions": ["tuscany"],
            "autoPlacedRegions": [],
        },
    ]
    client.post("/session", json={**SESSION_PAYLOAD, "history": history_1})
    client.post("/session", json={**SESSION_PAYLOAD, "history": history_2})
    data = client.get("/session/stats").json()

    region_map = {r["region"]: r["score_pct"] for r in data["top_regions"] + data["low_regions"]}
    # piemonte: 2 correct, 0 auto → 100%
    assert region_map["piemonte"] == pytest.approx(100.0)
    # tuscany: 1 correct, 1 auto → 50%
    assert region_map["tuscany"] == pytest.approx(50.0)


def test_stats_shows_last_5_sessions(client: TestClient):
    _register_and_get_client(client)
    single = [{
        "denominationName": "Barolo",
        "denominationType": "DOCG",
        "wrongAttempts": 0,
        "result": "correct",
        "foundRegions": ["piemonte"],
        "autoPlacedRegions": [],
    }]
    for _ in range(7):
        client.post("/session", json={**SESSION_PAYLOAD, "history": single})
    data = client.get("/session/stats").json()
    assert len(data["sessions"]) == 5
