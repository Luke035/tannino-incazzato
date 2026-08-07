"""Profile statistics for Promossi o Cirrotici (#24), through the HTTP boundary.

The profile answers the question a student has the week before the exam: am I
getting better, and what should I go and study? These tests defend the four
things the ticket asks of that answer.

The **exam list**: every *submitted* Exam, with its date, percentage, verdict
and time taken. In-progress and abandoned Sessions never appear, and neither do
Practice or Error Review Sessions — those are not exam results.

The **aggregates**: average and best exam result, and how many Exams were
passed out of how many were sat. Only Exams count towards a pass rate, because
only the Exam has a pass mark.

The **breakdowns**: performance by Level (1/2/3), by question format (Closed vs
Open — the pattern of doing fine on the tick-boxes and collapsing on the
written ones), and by topic (so the advice is "go and study sparkling wine
production", not "Level 1"). These draw from every *submitted* Session, because
a question answered in Practice was still answered.

The **separation**: quiz statistics are computed from the quiz's own tables and
never touch `game_sessions`, so Mappa dei Vini is provably unaffected.
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

from app.exams.model import (  # noqa: E402
    MODE_EXAM,
    MODE_PRACTICE,
    MODE_REVIEW,
    STATUS_ABANDONED,
    STATUS_IN_PROGRESS,
    STATUS_SUBMITTED,
    VERDICT_CORRECT,
    VERDICT_WRONG,
    ExamAnswer,
    ExamSession,
)
from app.questions.model import (  # noqa: E402
    FORMAT_MULTIPLE_CHOICE,
    FORMAT_OPEN,
    FORMAT_TRUE_FALSE,
    Question,
)

REGISTER_PAYLOAD = {
    "email": "quiz-stats@example.com",
    "password": "securepassword",
    "first_name": "Test",
    "last_name": "User",
}

OTHER_USER_PAYLOAD = {
    "email": "quiz-stats-intruder@example.com",
    "password": "securepassword",
    "first_name": "Other",
    "last_name": "Student",
}


def _register(client: TestClient) -> int:
    """Registers the primary user and returns their id (1 in a fresh DB)."""
    client.post("/auth/register", json=REGISTER_PAYLOAD)
    return 1


# ── Seeding helpers ───────────────────────────────────────────────────────────
# The stats endpoint reads the quiz tables directly, so the tests write them
# directly too: driving a whole Session through the mode routers to plant one
# known answer would bury the thing being asserted under the grading agent.

_next_question_id = [1]


def _question(db: Session, *, level: int, fmt: str, topic: str) -> Question:
    q = Question(
        id=_next_question_id[0],
        text=f"Q{_next_question_id[0]}",
        format=fmt,
        level=level,
        reference_answer="ref",
        topic=topic,
    )
    _next_question_id[0] += 1
    db.add(q)
    db.flush()
    return q


def _sitting(
    db: Session,
    *,
    user_id: int,
    mode: str,
    status: str,
    answers: list[tuple[Question, str | None]],
    started_minutes_ago: int = 30,
    duration_seconds: int | None = 600,
) -> ExamSession:
    """One Session with a fixed set of graded answers.

    `answers` is (question, verdict) — verdict None models an answer the agent
    could not read. `max_score`/`score` are set the way the real modes set
    them: the count of marked answers, and the correct ones among them.
    """
    started = datetime.now(timezone.utc) - timedelta(minutes=started_minutes_ago)
    marked = [(q, v) for q, v in answers if v is not None]
    scored = status == STATUS_SUBMITTED
    session = ExamSession(
        user_id=user_id,
        mode=mode,
        status=status,
        max_score=len(marked) if scored else len(answers),
        score=sum(1 for _, v in marked if v == VERDICT_CORRECT) if scored else None,
        duration_seconds=duration_seconds if scored else None,
        started_at=started,
        submitted_at=started + timedelta(seconds=duration_seconds or 0)
        if scored
        else None,
    )
    db.add(session)
    db.flush()
    for position, (question, verdict) in enumerate(answers):
        db.add(
            ExamAnswer(
                session_id=session.id,
                question_id=question.id,
                position=position,
                served_options=[],
                answer="x" if verdict is not None else None,
                verdict=verdict,
            )
        )
    db.commit()
    db.refresh(session)
    return session


# ── Empty state ───────────────────────────────────────────────────────────────

def test_empty_state_for_new_user(client: TestClient):
    _register(client)
    response = client.get("/quiz/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["aggregate"]["total_exams"] == 0
    assert data["exams"] == []
    assert data["by_level"] == []
    assert data["by_format"] == []
    assert data["by_topic"] == []


def test_requires_auth(client: TestClient):
    client.cookies.clear()
    assert client.get("/quiz/stats").status_code == 401


# ── The exam list ─────────────────────────────────────────────────────────────

def test_exam_list_holds_submitted_exams_only(client: TestClient, session: Session):
    user_id = _register(client)
    q1 = _question(session, level=1, fmt=FORMAT_MULTIPLE_CHOICE, topic="tasting")
    q2 = _question(session, level=2, fmt=FORMAT_OPEN, topic="winemaking")
    # A submitted Exam — appears.
    _sitting(
        session,
        user_id=user_id,
        mode=MODE_EXAM,
        status=STATUS_SUBMITTED,
        answers=[(q1, VERDICT_CORRECT), (q2, VERDICT_WRONG)],
    )
    # An in-progress Exam, an abandoned Exam, and a submitted Practice — none appear.
    _sitting(session, user_id=user_id, mode=MODE_EXAM, status=STATUS_IN_PROGRESS,
             answers=[(q1, None)])
    _sitting(session, user_id=user_id, mode=MODE_EXAM, status=STATUS_ABANDONED,
             answers=[(q1, VERDICT_CORRECT)])
    _sitting(session, user_id=user_id, mode=MODE_PRACTICE, status=STATUS_SUBMITTED,
             answers=[(q1, VERDICT_CORRECT)])

    data = client.get("/quiz/stats").json()
    assert len(data["exams"]) == 1
    exam = data["exams"][0]
    assert exam["score_pct"] == pytest.approx(50.0)
    assert exam["passed"] is False
    assert exam["duration_seconds"] == 600
    assert exam["played_at"] is not None


def test_exam_pass_and_verdict(client: TestClient, session: Session):
    user_id = _register(client)
    # 18/30 is the pass mark; model a clean pass and a clean fail.
    passed_qs = [_question(session, level=1, fmt=FORMAT_TRUE_FALSE, topic="service")
                 for _ in range(20)]
    _sitting(
        session, user_id=user_id, mode=MODE_EXAM, status=STATUS_SUBMITTED,
        answers=[(q, VERDICT_CORRECT if i < 18 else VERDICT_WRONG)
                 for i, q in enumerate(passed_qs)],
    )
    data = client.get("/quiz/stats").json()
    assert data["exams"][0]["passed"] is True
    assert data["aggregate"]["exams_passed"] == 1
    assert data["aggregate"]["total_exams"] == 1


# ── Aggregates ────────────────────────────────────────────────────────────────

def test_aggregates_average_best_and_pass_rate(client: TestClient, session: Session):
    user_id = _register(client)
    qs = [_question(session, level=1, fmt=FORMAT_TRUE_FALSE, topic="service")
          for _ in range(10)]
    # Exam A: 8/10 = 80% (pass). Exam B: 4/10 = 40% (fail).
    _sitting(session, user_id=user_id, mode=MODE_EXAM, status=STATUS_SUBMITTED,
             answers=[(q, VERDICT_CORRECT if i < 8 else VERDICT_WRONG)
                      for i, q in enumerate(qs)])
    _sitting(session, user_id=user_id, mode=MODE_EXAM, status=STATUS_SUBMITTED,
             answers=[(q, VERDICT_CORRECT if i < 4 else VERDICT_WRONG)
                      for i, q in enumerate(qs)])
    agg = client.get("/quiz/stats").json()["aggregate"]
    assert agg["total_exams"] == 2
    assert agg["exams_passed"] == 1
    assert agg["avg_score_pct"] == pytest.approx(60.0)
    assert agg["best_score_pct"] == pytest.approx(80.0)


# ── Breakdowns draw from every submitted Session ──────────────────────────────

def test_by_format_closed_vs_open(client: TestClient, session: Session):
    user_id = _register(client)
    mc = _question(session, level=1, fmt=FORMAT_MULTIPLE_CHOICE, topic="tasting")
    tf = _question(session, level=1, fmt=FORMAT_TRUE_FALSE, topic="tasting")
    op = _question(session, level=1, fmt=FORMAT_OPEN, topic="tasting")
    # Closed ones right, the written one wrong — the exact pattern the ticket names.
    _sitting(session, user_id=user_id, mode=MODE_EXAM, status=STATUS_SUBMITTED,
             answers=[(mc, VERDICT_CORRECT), (tf, VERDICT_CORRECT), (op, VERDICT_WRONG)])
    fmt = {row["format"]: row for row in client.get("/quiz/stats").json()["by_format"]}
    assert fmt["closed"]["correct_pct"] == pytest.approx(100.0)
    assert fmt["open"]["correct_pct"] == pytest.approx(0.0)


def test_by_level_and_topic_include_practice(client: TestClient, session: Session):
    user_id = _register(client)
    l1 = _question(session, level=1, fmt=FORMAT_MULTIPLE_CHOICE, topic="sparkling_wines")
    l3 = _question(session, level=3, fmt=FORMAT_OPEN, topic="legislation")
    # A submitted Practice contributes to the breakdowns.
    _sitting(session, user_id=user_id, mode=MODE_PRACTICE, status=STATUS_SUBMITTED,
             answers=[(l1, VERDICT_WRONG)])
    _sitting(session, user_id=user_id, mode=MODE_EXAM, status=STATUS_SUBMITTED,
             answers=[(l3, VERDICT_CORRECT)])
    data = client.get("/quiz/stats").json()
    levels = {row["level"]: row for row in data["by_level"]}
    assert levels[1]["correct_pct"] == pytest.approx(0.0)
    assert levels[3]["correct_pct"] == pytest.approx(100.0)
    topics = {row["topic"]: row for row in data["by_topic"]}
    assert topics["sparkling_wines"]["correct_pct"] == pytest.approx(0.0)
    assert topics["legislation"]["correct_pct"] == pytest.approx(100.0)


def test_breakdowns_ignore_abandoned_and_in_progress(client: TestClient, session: Session):
    user_id = _register(client)
    q = _question(session, level=2, fmt=FORMAT_MULTIPLE_CHOICE, topic="viticulture")
    _sitting(session, user_id=user_id, mode=MODE_PRACTICE, status=STATUS_ABANDONED,
             answers=[(q, VERDICT_WRONG)])
    _sitting(session, user_id=user_id, mode=MODE_PRACTICE, status=STATUS_IN_PROGRESS,
             answers=[(q, None)])
    _sitting(session, user_id=user_id, mode=MODE_EXAM, status=STATUS_SUBMITTED,
             answers=[(q, VERDICT_CORRECT)])
    topics = {r["topic"]: r for r in client.get("/quiz/stats").json()["by_topic"]}
    # Only the submitted correct answer counts: the abandoned wrong one does not
    # drag the topic down.
    assert topics["viticulture"]["correct_pct"] == pytest.approx(100.0)
    assert topics["viticulture"]["answered"] == 1


# ── Still-to-master count ─────────────────────────────────────────────────────

def test_pending_mastery_count(client: TestClient, session: Session):
    user_id = _register(client)
    q = _question(session, level=1, fmt=FORMAT_MULTIPLE_CHOICE, topic="service")
    # Answered once, wrong — one question waiting to be mastered.
    _sitting(session, user_id=user_id, mode=MODE_PRACTICE, status=STATUS_SUBMITTED,
             answers=[(q, VERDICT_WRONG)])
    assert client.get("/quiz/stats").json()["pending_mastery"] == 1


# ── Isolation from another user ───────────────────────────────────────────────

def test_only_own_sessions_count(client: TestClient, session: Session):
    user_id = _register(client)
    client.post("/auth/register", json=OTHER_USER_PAYLOAD)  # user 2, now logged in
    q = _question(session, level=1, fmt=FORMAT_MULTIPLE_CHOICE, topic="service")
    # User 1's exam. The client is now user 2, who has none.
    _sitting(session, user_id=user_id, mode=MODE_EXAM, status=STATUS_SUBMITTED,
             answers=[(q, VERDICT_CORRECT)])
    data = client.get("/quiz/stats").json()
    assert data["exams"] == []
    assert data["aggregate"]["total_exams"] == 0
