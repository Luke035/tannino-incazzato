"""The Exam of Promossi o Cirrotici, exercised through the HTTP boundary.

Every decision worth defending in this game is observable to a caller of the
API — the composition of the paper, the absence of the correct answers from the
payload, the pass mark — so that is where it is tested. Prior art:
`tests/test_sessions.py`.
"""
import os

from fastapi.testclient import TestClient
from sqlmodel import Session, select

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

from app.exams.model import (  # noqa: E402
    EXAM_COMPOSITION,
    EXAM_LENGTH,
    PASS_MARK_PCT,
    STATUS_IN_PROGRESS,
    STATUS_SUBMITTED,
    VERDICT_CORRECT,
    VERDICT_WRONG,
)
from app.questions.model import (  # noqa: E402
    FORMAT_MULTIPLE_CHOICE,
    FORMAT_OPEN,
    FORMAT_TRUE_FALSE,
    Question,
)

REGISTER_PAYLOAD = {
    "email": "exam-test@example.com",
    "password": "securepassword",
    "first_name": "Test",
    "last_name": "User",
}

OTHER_USER_PAYLOAD = {
    "email": "exam-intruder@example.com",
    "password": "securepassword",
    "first_name": "Other",
    "last_name": "Student",
}

# The correct multiple-choice option is the one that says so, whatever position
# the backend shuffled it into. It is necessarily in the payload — it is one of
# the options — so it is not what a leak looks like.
CORRECT_MARKER = "giusta"

# The explanation, on the other hand, spells the answer out in prose and has no
# business being served. It is the marker a leak test can trust.
SECRET_MARKER = "spiegazione riservata"


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _authenticate(client: TestClient, payload: dict = REGISTER_PAYLOAD) -> TestClient:
    client.post("/auth/register", json=payload)
    return client


def _seed_bank(
    session: Session,
    multiple_choice: int = 60,
    true_false: int = 40,
    open_questions: int = 10,
    levels: tuple[int, ...] = (1, 2, 3),
) -> None:
    """A bank shaped like the real one: the correct option is always the first,
    which is exactly why the backend has to shuffle."""
    for n in range(multiple_choice):
        session.add(
            Question(
                text=f"MC {n}",
                format=FORMAT_MULTIPLE_CHOICE,
                level=levels[n % len(levels)],
                reference_answer=f"MC {n} {CORRECT_MARKER}",
                options=[
                    f"MC {n} {CORRECT_MARKER}",
                    f"MC {n} sbagliata A",
                    f"MC {n} sbagliata B",
                ],
                explanation=f"MC {n}: {SECRET_MARKER}",
            )
        )
    for n in range(true_false):
        session.add(
            Question(
                text=f"TF {n}",
                format=FORMAT_TRUE_FALSE,
                level=levels[n % len(levels)],
                reference_answer="VERO" if n % 2 == 0 else "FALSO",
                options=[],
                explanation=f"TF {n}: {SECRET_MARKER}",
            )
        )
    for n in range(open_questions):
        session.add(
            Question(
                text=f"OPEN {n}",
                format=FORMAT_OPEN,
                level=levels[n % len(levels)],
                reference_answer=f"OPEN {n} {CORRECT_MARKER}",
                options=[],
                open_subtype="conceptual",
            )
        )
    session.commit()


def _correct_answer(question: dict) -> str:
    if question["format"] == FORMAT_MULTIPLE_CHOICE:
        return next(o for o in question["options"] if o.endswith(CORRECT_MARKER))
    index = int(question["text"].split()[1])
    return "VERO" if index % 2 == 0 else "FALSO"


def _wrong_answer(question: dict) -> str:
    if question["format"] == FORMAT_MULTIPLE_CHOICE:
        return next(o for o in question["options"] if not o.endswith(CORRECT_MARKER))
    return "FALSO" if _correct_answer(question) == "VERO" else "VERO"


def _start_exam(client: TestClient) -> dict:
    response = client.post("/quiz/exams")
    assert response.status_code == 201, response.text
    return response.json()


def _answer(client: TestClient, exam_id: int, question: dict, value: str | None):
    return client.put(
        f"/quiz/exams/{exam_id}/answers/{question['question_id']}",
        json={"answer": value},
    )


def _submit(client: TestClient, exam_id: int) -> dict:
    response = client.post(f"/quiz/exams/{exam_id}/submit")
    assert response.status_code == 200, response.text
    return response.json()


def _sit_exam(client: TestClient, exam: dict, correct: int) -> dict:
    """Answer the first `correct` questions right, the rest wrong."""
    for position, question in enumerate(exam["questions"]):
        value = _correct_answer(question) if position < correct else _wrong_answer(question)
        assert _answer(client, exam["id"], question, value).status_code == 200
    return _submit(client, exam["id"])


# ── Auth and ownership ────────────────────────────────────────────────────────

def test_starting_an_exam_requires_authentication(client: TestClient, session: Session):
    _seed_bank(session)
    client.cookies.clear()

    assert client.post("/quiz/exams").status_code == 401


def test_an_exam_cannot_be_read_by_anyone_but_its_owner(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    _authenticate(client, OTHER_USER_PAYLOAD)

    assert client.get(f"/quiz/exams/{exam['id']}").status_code == 404


def test_an_exam_cannot_be_answered_or_submitted_by_anyone_but_its_owner(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    question = exam["questions"][0]

    _authenticate(client, OTHER_USER_PAYLOAD)

    assert _answer(client, exam["id"], question, _correct_answer(question)).status_code == 404
    assert client.post(f"/quiz/exams/{exam['id']}/submit").status_code == 404


def test_an_unknown_exam_is_not_found(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)

    assert client.get("/quiz/exams/999").status_code == 404


# ── Composition ───────────────────────────────────────────────────────────────

def test_an_exam_is_drawn_in_the_closed_question_composition(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)

    exam = _start_exam(client)

    assert len(exam["questions"]) == EXAM_LENGTH
    assert exam["max_score"] == EXAM_LENGTH
    formats: dict[str, int] = {}
    for question in exam["questions"]:
        formats[question["format"]] = formats.get(question["format"], 0) + 1
    assert formats == dict(EXAM_COMPOSITION)


def test_an_exam_holds_no_open_questions_yet(client: TestClient, session: Session):
    """Open Questions arrive with the grading agent — this Exam is closed only."""
    _seed_bank(session)
    _authenticate(client)

    exam = _start_exam(client)

    assert all(q["format"] != FORMAT_OPEN for q in exam["questions"])


def test_an_exam_draws_across_all_three_levels(client: TestClient, session: Session):
    """Selection is never filtered by Level: the real exam is a single sitting
    across the whole course. The bank here holds ten multiple-choice questions
    per Level, so a draw of more than twenty cannot come from two Levels."""
    _seed_bank(session, multiple_choice=30, true_false=40, open_questions=0)
    _authenticate(client)

    exam = _start_exam(client)

    assert EXAM_COMPOSITION[FORMAT_MULTIPLE_CHOICE] > 20
    levels = {
        q["level"] for q in exam["questions"] if q["format"] == FORMAT_MULTIPLE_CHOICE
    }
    assert levels == {1, 2, 3}


def test_inactive_questions_are_never_drawn(client: TestClient, session: Session):
    _seed_bank(session)
    retired = session.exec(select(Question).where(Question.text == "MC 0")).one()
    retired.active = False
    session.add(retired)
    session.commit()
    _authenticate(client)

    exam = _start_exam(client)

    assert all(q["text"] != "MC 0" for q in exam["questions"])


def test_a_bank_too_thin_to_fill_the_paper_is_refused(
    client: TestClient, session: Session
):
    _seed_bank(session, multiple_choice=2, true_false=2, open_questions=0)
    _authenticate(client)

    assert client.post("/quiz/exams").status_code == 409


def test_no_question_of_the_preceding_exam_appears_in_the_next_one(
    client: TestClient, session: Session
):
    _seed_bank(session, multiple_choice=60, true_false=40, open_questions=0)
    _authenticate(client)

    first = _start_exam(client)
    second = _start_exam(client)

    first_ids = {q["question_id"] for q in first["questions"]}
    second_ids = {q["question_id"] for q in second["questions"]}
    assert first_ids.isdisjoint(second_ids)


# ── What the browser is allowed to see ────────────────────────────────────────

def test_no_reference_answer_reaches_the_browser_while_the_exam_is_in_progress(
    client: TestClient, session: Session
):
    """The highest-value test in the suite (ADR 0007). A grade computed in a
    context that holds the answers is not a grade."""
    _seed_bank(session)
    _authenticate(client)

    created = client.post("/quiz/exams")
    exam = created.json()
    question = exam["questions"][0]
    answered = _answer(client, exam["id"], question, _correct_answer(question))
    fetched = client.get(f"/quiz/exams/{exam['id']}")

    for response in (created, answered, fetched):
        assert "reference_answer" not in response.text
        assert "explanation" not in response.text
        # The explanation spells the answer out in prose: serving it would
        # defeat the game exactly as serving the answer itself would.
        assert SECRET_MARKER not in response.text
    # Nothing in the payload says which of the served options is the right one.
    assert all(q["correct_answer"] is None for q in fetched.json()["questions"])
    assert all(q["verdict"] is None for q in fetched.json()["questions"])


def test_answering_in_exam_mode_does_not_return_a_verdict(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    question = exam["questions"][0]

    response = _answer(client, exam["id"], question, _correct_answer(question))

    assert response.status_code == 200
    assert "verdict" not in response.text
    assert client.get(f"/quiz/exams/{exam['id']}").json()["questions"][0]["verdict"] is None


def test_an_exam_in_progress_emits_no_score(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)

    exam = _start_exam(client)

    assert exam["status"] == STATUS_IN_PROGRESS
    assert exam["score"] is None
    assert exam["score_pct"] is None
    assert exam["passed"] is None


# ── Shuffling ─────────────────────────────────────────────────────────────────

def test_multiple_choice_options_are_not_served_in_source_order(
    client: TestClient, session: Session
):
    """In the source bank the correct option is always the first one."""
    _seed_bank(session)
    _authenticate(client)

    exam = _start_exam(client)
    multiple_choice = [
        q for q in exam["questions"] if q["format"] == FORMAT_MULTIPLE_CHOICE
    ]

    first_is_correct = [q["options"][0].endswith(CORRECT_MARKER) for q in multiple_choice]
    assert not all(first_is_correct), "the correct option was always served first"
    assert all(len(q["options"]) == 3 for q in multiple_choice)


def test_the_served_option_order_survives_a_refetch(client: TestClient, session: Session):
    """A resumed Exam must show the same paper, not a reshuffled one."""
    _seed_bank(session)
    _authenticate(client)

    exam = _start_exam(client)
    refetched = client.get(f"/quiz/exams/{exam['id']}").json()

    assert [q["options"] for q in refetched["questions"]] == [
        q["options"] for q in exam["questions"]
    ]
    assert [q["question_id"] for q in refetched["questions"]] == [
        q["question_id"] for q in exam["questions"]
    ]


def test_true_false_questions_are_served_with_both_choices(
    client: TestClient, session: Session
):
    """The player answers in the bank's own vocabulary; the screen localizes it."""
    _seed_bank(session)
    _authenticate(client)

    exam = _start_exam(client)
    true_false = [q for q in exam["questions"] if q["format"] == FORMAT_TRUE_FALSE]

    assert true_false
    assert all(q["options"] == ["VERO", "FALSO"] for q in true_false)


# ── Answering ─────────────────────────────────────────────────────────────────

def test_an_answer_is_persisted_and_comes_back_on_a_refetch(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    question = exam["questions"][2]
    chosen = _correct_answer(question)

    _answer(client, exam["id"], question, chosen)

    refetched = client.get(f"/quiz/exams/{exam['id']}").json()
    assert refetched["questions"][2]["answer"] == chosen
    assert refetched["questions"][0]["answer"] is None


def test_an_answer_can_be_changed(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    question = exam["questions"][0]

    _answer(client, exam["id"], question, _wrong_answer(question))
    _answer(client, exam["id"], question, _correct_answer(question))

    result = _submit(client, exam["id"])
    assert result["questions"][0]["verdict"] == VERDICT_CORRECT


def test_an_answer_can_be_cleared(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    question = exam["questions"][0]

    _answer(client, exam["id"], question, _correct_answer(question))
    assert _answer(client, exam["id"], question, None).status_code == 200

    assert client.get(f"/quiz/exams/{exam['id']}").json()["questions"][0]["answer"] is None


def test_an_answer_outside_the_served_options_is_refused(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    question = exam["questions"][0]

    response = _answer(client, exam["id"], question, "una risposta inventata")

    assert response.status_code == 422


def test_a_question_outside_the_exam_cannot_be_answered(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    served = {q["question_id"] for q in exam["questions"]}
    from sqlmodel import select

    outsider = next(
        q for q in session.exec(select(Question)).all() if q.id not in served
    )

    response = client.put(
        f"/quiz/exams/{exam['id']}/answers/{outsider.id}", json={"answer": "VERO"}
    )

    assert response.status_code == 404


# ── Grading ───────────────────────────────────────────────────────────────────

def test_closed_questions_are_graded_by_exact_comparison(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    result = _sit_exam(client, exam, correct=EXAM_LENGTH)

    assert result["status"] == STATUS_SUBMITTED
    assert result["score"] == EXAM_LENGTH
    assert all(q["verdict"] == VERDICT_CORRECT for q in result["questions"])


def test_every_wrong_answer_costs_exactly_one_point(
    client: TestClient, session: Session
):
    """One point per question: no weighting, no negative marking, no partial
    credit."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    result = _sit_exam(client, exam, correct=EXAM_LENGTH - 4)

    assert result["score"] == EXAM_LENGTH - 4
    assert sum(1 for q in result["questions"] if q["verdict"] == VERDICT_WRONG) == 4


def test_an_unanswered_question_is_wrong(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    for question in exam["questions"][:-1]:
        _answer(client, exam["id"], question, _correct_answer(question))
    result = client.post(f"/quiz/exams/{exam['id']}/submit").json()

    assert result["questions"][-1]["answer"] is None
    assert result["questions"][-1]["verdict"] == VERDICT_WRONG
    assert result["score"] == EXAM_LENGTH - 1


def test_an_exam_can_be_submitted_entirely_blank(client: TestClient, session: Session):
    """Submission is always possible: the player is never trapped in a Session
    they want to end."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    result = client.post(f"/quiz/exams/{exam['id']}/submit")

    assert result.status_code == 200
    assert result.json()["score"] == 0
    assert result.json()["passed"] is False


def test_the_recap_reveals_the_correct_answer_once_the_exam_is_submitted(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    result = _sit_exam(client, exam, correct=0)

    assert all(q["correct_answer"] for q in result["questions"])
    fetched = client.get(f"/quiz/exams/{exam['id']}").json()
    assert [q["correct_answer"] for q in fetched["questions"]] == [
        q["correct_answer"] for q in result["questions"]
    ]


def test_a_submitted_exam_cannot_be_submitted_again(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    client.post(f"/quiz/exams/{exam['id']}/submit")

    assert client.post(f"/quiz/exams/{exam['id']}/submit").status_code == 409


def test_a_submitted_exam_cannot_be_answered(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    question = exam["questions"][0]
    client.post(f"/quiz/exams/{exam['id']}/submit")

    assert _answer(client, exam["id"], question, _correct_answer(question)).status_code == 409


# ── The pass mark ─────────────────────────────────────────────────────────────

def test_the_pass_mark_is_sixty_percent():
    assert PASS_MARK_PCT == 60
    assert EXAM_LENGTH * PASS_MARK_PCT % 100 == 0, "the pass mark must land on a whole question"


def test_an_exam_exactly_on_the_pass_mark_passes(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    on_the_mark = EXAM_LENGTH * PASS_MARK_PCT // 100

    result = _sit_exam(client, exam, correct=on_the_mark)

    assert result["score"] == on_the_mark
    assert result["score_pct"] == 60.0
    assert result["passed"] is True


def test_an_exam_one_mark_below_the_pass_mark_fails(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    below = EXAM_LENGTH * PASS_MARK_PCT // 100 - 1

    result = _sit_exam(client, exam, correct=below)

    assert result["score"] == below
    assert result["score_pct"] < 60.0
    assert result["passed"] is False


def test_the_verdict_is_decided_on_whole_marks_not_on_the_rounded_percentage(
    client: TestClient, session: Session
):
    """The percentage is for the screen. A paper that fell short of the mark
    must not round its way onto it — over 30 questions no score can, but
    Practice brings papers of 10 and 20 where one could."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    below = EXAM_LENGTH * PASS_MARK_PCT // 100 - 1

    result = _sit_exam(client, exam, correct=below)

    assert result["passed"] is (result["score"] * 100 >= result["max_score"] * PASS_MARK_PCT)
    assert result["passed"] is False


def test_an_exam_above_the_pass_mark_passes(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    above = EXAM_LENGTH * PASS_MARK_PCT // 100 + 1

    result = _sit_exam(client, exam, correct=above)

    assert result["passed"] is True
    assert result["score_pct"] > 60.0


# ── Time ──────────────────────────────────────────────────────────────────────

def test_the_time_taken_is_stored_with_the_exam(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    assert exam["started_at"]
    assert exam["duration_seconds"] is None

    result = client.post(f"/quiz/exams/{exam['id']}/submit").json()

    assert result["duration_seconds"] >= 0
    assert result["submitted_at"]


# ── Separation from Mappa dei Vini (ADR 0008) ─────────────────────────────────

def test_an_exam_never_enters_the_wine_map_statistics(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    _sit_exam(client, exam, correct=EXAM_LENGTH)

    stats = client.get("/session/stats").json()

    assert stats["aggregate"]["total_sessions"] == 0
    assert stats["sessions"] == []
