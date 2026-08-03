import os

from fastapi.testclient import TestClient
from sqlmodel import Session

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

from app.questions.model import (  # noqa: E402
    FORMAT_MULTIPLE_CHOICE,
    FORMAT_OPEN,
    FORMAT_TRUE_FALSE,
    Question,
)

REGISTER_PAYLOAD = {
    "email": "quiz-test@example.com",
    "password": "securepassword",
    "first_name": "Test",
    "last_name": "User",
}

MC_OPTIONS = ["A tre litri", "A quattro Magnum", "A cinque litri"]


def _authenticate(client: TestClient) -> TestClient:
    client.post("/auth/register", json=REGISTER_PAYLOAD)
    return client


def _add_multiple_choice(session: Session, **overrides) -> Question:
    question = Question(
        text="[question text removed]",
        format=FORMAT_MULTIPLE_CHOICE,
        level=1,
        reference_answer="A tre litri",
        options=list(MC_OPTIONS),
        explanation="[question text removed]",
        topic="servizio",
        **overrides,
    )
    session.add(question)
    session.commit()
    session.refresh(question)
    return question


# ── Auth ──────────────────────────────────────────────────────────────────────

def test_get_question_requires_authentication(client: TestClient, session: Session):
    _add_multiple_choice(session)
    client.cookies.clear()

    response = client.get("/quiz/question")
    assert response.status_code == 401


# ── Payload shape ─────────────────────────────────────────────────────────────

def test_get_question_returns_a_question(client: TestClient, session: Session):
    _add_multiple_choice(session)
    _authenticate(client)

    response = client.get("/quiz/question")
    assert response.status_code == 200

    data = response.json()
    assert data["text"] == "[question text removed]"
    assert data["format"] == FORMAT_MULTIPLE_CHOICE
    assert data["level"] == 1
    assert sorted(data["options"]) == sorted(MC_OPTIONS)


def test_question_payload_never_carries_the_reference_answer(
    client: TestClient, session: Session
):
    """The browser must never receive the correct answer for a question it has
    not answered — neither directly nor through the explanation, which spells
    the answer out in prose."""
    _add_multiple_choice(session)
    _authenticate(client)

    response = client.get("/quiz/question")
    data = response.json()

    assert set(data.keys()) == {"id", "text", "format", "level", "options", "topic"}
    assert "reference_answer" not in data
    assert "explanation" not in data
    # nothing in the payload says which of the served options is the right one
    assert "jéroboam corrisponde" not in response.text


def test_open_question_payload_carries_no_options(client: TestClient, session: Session):
    session.add(
        Question(
            text="Example question 1?",
            format=FORMAT_OPEN,
            level=2,
            reference_answer="Soave Piave Valpolicella",
            options=[],
        )
    )
    session.commit()
    _authenticate(client)

    data = client.get("/quiz/question").json()
    assert data["format"] == FORMAT_OPEN
    assert data["options"] == []
    assert "Soave" not in client.get("/quiz/question").text


def test_true_false_question_payload_carries_no_options(
    client: TestClient, session: Session
):
    session.add(
        Question(
            text="[question text removed]",
            format=FORMAT_TRUE_FALSE,
            level=2,
            reference_answer="FALSO",
            options=[],
        )
    )
    session.commit()
    _authenticate(client)

    data = client.get("/quiz/question").json()
    assert data["format"] == FORMAT_TRUE_FALSE
    assert data["options"] == []


# ── Option shuffling ──────────────────────────────────────────────────────────

def test_multiple_choice_options_are_not_served_in_source_order(
    client: TestClient, session: Session
):
    """In the source bank the correct answer is always the first option, so
    serving source order would make every multiple-choice question guessable."""
    _add_multiple_choice(session)
    _authenticate(client)

    orders = {tuple(client.get("/quiz/question").json()["options"]) for _ in range(25)}

    assert len(orders) > 1, "options were served in the same order every time"
    assert all(sorted(order) == sorted(MC_OPTIONS) for order in orders)


# ── Selection ─────────────────────────────────────────────────────────────────

def test_inactive_questions_are_never_served(client: TestClient, session: Session):
    _add_multiple_choice(session, active=False)
    _authenticate(client)

    response = client.get("/quiz/question")
    assert response.status_code == 404


def test_empty_bank_returns_404(client: TestClient):
    _authenticate(client)

    response = client.get("/quiz/question")
    assert response.status_code == 404


def test_questions_are_drawn_at_random(client: TestClient, session: Session):
    for n in range(12):
        session.add(
            Question(
                text=f"Domanda {n}",
                format=FORMAT_TRUE_FALSE,
                level=1,
                reference_answer="VERO",
                options=[],
            )
        )
    session.commit()
    _authenticate(client)

    seen = {client.get("/quiz/question").json()["text"] for _ in range(30)}
    assert len(seen) > 1, "the same question was served every time"
