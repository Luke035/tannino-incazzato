from unittest.mock import AsyncMock, patch


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


def test_hint_returns_hint(client):
    with patch("app.ai.router.generate_hint", new=AsyncMock(return_value="Think mountains and truffles.")):
        response = client.post("/hint", json=HINT_PAYLOAD)
    assert response.status_code == 200
    assert response.json() == {"hint": "Think mountains and truffles."}


def test_hint_missing_field_returns_422(client):
    payload = {k: v for k, v in HINT_PAYLOAD.items() if k != "wrongRegion"}
    response = client.post("/hint", json=payload)
    assert response.status_code == 422


def test_memorize_returns_tip(client):
    with patch("app.ai.router.generate_memorize_tip", new=AsyncMock(return_value="Barolo is king of Piemonte.")):
        response = client.post("/memorize", json=MEMORIZE_PAYLOAD)
    assert response.status_code == 200
    assert response.json() == {"tip": "Barolo is king of Piemonte."}


def test_review_returns_review(client):
    with patch("app.ai.router.generate_review", new=AsyncMock(return_value="Good session overall.")):
        response = client.post("/review", json=REVIEW_PAYLOAD)
    assert response.status_code == 200
    assert response.json() == {"review": "Good session overall."}
