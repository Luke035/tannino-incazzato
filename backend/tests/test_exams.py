"""The Exam of Promossi o Cirrotici, exercised through the HTTP boundary.

Every decision worth defending in this game is observable to a caller of the
API — the composition of the paper, the absence of the correct answers from the
payload, the pass mark — so that is where it is tested. Prior art:
`tests/test_sessions.py`.
"""
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Iterable, List, Optional
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

from app.ai.grading import GradedOpenAnswer, OpenAnswerToGrade  # noqa: E402
from app.exams.model import (  # noqa: E402
    EXAM_COMPOSITION,
    EXAM_LENGTH,
    MAX_OPEN_ANSWER_CHARS,
    MODE_EXAM,
    PASS_MARK_PCT,
    STATUS_ABANDONED,
    STATUS_IN_PROGRESS,
    STATUS_SUBMITTED,
    VERDICT_CORRECT,
    VERDICT_WRONG,
    ExamSession,
)
from app.questions.model import (  # noqa: E402
    FORMAT_MULTIPLE_CHOICE,
    FORMAT_OPEN,
    FORMAT_TRUE_FALSE,
    SUBTYPE_CONCEPTUAL,
    SUBTYPE_LIST,
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
    open_questions: int = 40,
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
                explanation=f"OPEN {n}: {SECRET_MARKER}",
                open_subtype=SUBTYPE_LIST if n % 2 else SUBTYPE_CONCEPTUAL,
            )
        )
    session.commit()


def _correct_answer(question: dict) -> str:
    """What a student who knows their material writes. On an Open Question that
    is free text, so the stand-in agent below reads it: nothing
    the browser holds says what the right answer is."""
    if question["format"] == FORMAT_MULTIPLE_CHOICE:
        return next(o for o in question["options"] if o.endswith(CORRECT_MARKER))
    if question["format"] == FORMAT_OPEN:
        return f"una risposta {CORRECT_MARKER}"
    index = int(question["text"].split()[1])
    return "VERO" if index % 2 == 0 else "FALSO"


def _wrong_answer(question: dict) -> str:
    if question["format"] == FORMAT_MULTIPLE_CHOICE:
        return next(o for o in question["options"] if not o.endswith(CORRECT_MARKER))
    if question["format"] == FORMAT_OPEN:
        return "una risposta sbagliata"
    return "FALSO" if _correct_answer(question) == "VERO" else "VERO"


# ── The grading agent, stood in for ───────────────────────────────────────────
# Patched at the router's import site, the way `tests/test_ai.py` patches the
# Gemini calls: no test in this file ever reaches a model.

@contextmanager
def _grader(
    *,
    unavailable: bool = False,
    ungraded: Iterable[int] = (),
    seen: Optional[List[dict]] = None,
):
    """`unavailable` is the agent being down; `ungraded` is it coming back
    without those questions — the two failures the paper has to survive."""
    withheld = set(ungraded)

    async def _grade(items: List[OpenAnswerToGrade], language: str):
        if seen is not None:
            seen.append({"items": list(items), "language": language})
        if unavailable:
            return {}
        return {
            item.question_id: GradedOpenAnswer(
                question_id=item.question_id,
                acceptable=CORRECT_MARKER in item.player_answer,
                explanation=f"[{language}] manca il nocciolo della risposta",
            )
            for item in items
            if item.question_id not in withheld
        }

    with patch("app.exams.router.grade_open_answers", new=AsyncMock(side_effect=_grade)):
        yield


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


def _abandon(client: TestClient, exam_id: int, expect: int = 200):
    response = client.post(f"/quiz/exams/{exam_id}/abandon")
    assert response.status_code == expect, response.text
    return response.json()


def _current(client: TestClient) -> Optional[dict]:
    """The Session in progress, or `None` when the slot is free."""
    response = client.get("/quiz/exams/current")
    assert response.status_code == 200, response.text
    return response.json()


def _grade(client: TestClient, exam_id: int, language: str = "en", expect: int = 200):
    response = client.post(f"/quiz/exams/{exam_id}/grade", json={"language": language})
    assert response.status_code == expect, response.text
    return response.json()


def _first(exam: dict, question_format: str) -> dict:
    """The paper is shuffled, so a test that needs one particular format has to
    ask for it rather than reach for `questions[0]`."""
    return next(q for q in exam["questions"] if q["format"] == question_format)


def _find(exam: dict, question_id: int) -> dict:
    return next(q for q in exam["questions"] if q["question_id"] == question_id)


def _fill_in(client: TestClient, exam: dict, correct: int) -> None:
    """Answer the first `correct` questions right, the rest wrong."""
    for position, question in enumerate(exam["questions"]):
        value = _correct_answer(question) if position < correct else _wrong_answer(question)
        assert _answer(client, exam["id"], question, value).status_code == 200


def _sit_exam(client: TestClient, exam: dict, correct: int, **grader) -> dict:
    """The whole sitting: fill the paper in, hand it in, and let the agent
    finish the written answers."""
    _fill_in(client, exam, correct)
    _submit(client, exam["id"])
    with _grader(**grader):
        return _grade(client, exam["id"])


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

def test_an_exam_is_drawn_in_the_full_composition(client: TestClient, session: Session):
    """14 open, 11 multiple choice, 5 true/false — the real paper."""
    _seed_bank(session)
    _authenticate(client)

    exam = _start_exam(client)

    assert len(exam["questions"]) == EXAM_LENGTH
    assert exam["max_score"] == EXAM_LENGTH
    formats: dict[str, int] = {}
    for question in exam["questions"]:
        formats[question["format"]] = formats.get(question["format"], 0) + 1
    assert formats == dict(EXAM_COMPOSITION)
    assert formats == {FORMAT_OPEN: 14, FORMAT_MULTIPLE_CHOICE: 11, FORMAT_TRUE_FALSE: 5}


def test_open_questions_are_served_with_no_options(client: TestClient, session: Session):
    """An Open Question is answered in free text — anything in `options` would
    be the browser offering a choice the exam does not give."""
    _seed_bank(session)
    _authenticate(client)

    exam = _start_exam(client)
    open_questions = [q for q in exam["questions"] if q["format"] == FORMAT_OPEN]

    assert len(open_questions) == EXAM_COMPOSITION[FORMAT_OPEN]
    assert all(q["options"] == [] for q in open_questions)


def test_an_exam_draws_across_all_three_levels(client: TestClient, session: Session):
    """Selection is never filtered by Level: the real exam is a single sitting
    across the whole course, and a blind draw takes the Levels in the
    proportion the bank holds them. The bank here holds five Open Questions per
    Level, so a draw of fourteen cannot come from two Levels."""
    _seed_bank(session, multiple_choice=60, true_false=40, open_questions=15)
    _authenticate(client)

    exam = _start_exam(client)

    assert EXAM_COMPOSITION[FORMAT_OPEN] > 10
    levels = {q["level"] for q in exam["questions"] if q["format"] == FORMAT_OPEN}
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
    _seed_bank(session, multiple_choice=60, true_false=40, open_questions=40)
    _authenticate(client)

    first = _start_exam(client)
    # The slot has to be freed before a second paper can be drawn, and an
    # abandoned paper still counts as the one just seen.
    _abandon(client, first["id"])
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
    question = _first(exam, FORMAT_MULTIPLE_CHOICE)

    _answer(client, exam["id"], question, _wrong_answer(question))
    _answer(client, exam["id"], question, _correct_answer(question))

    result = _submit(client, exam["id"])
    assert _find(result, question["question_id"])["verdict"] == VERDICT_CORRECT


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
    question = _first(exam, FORMAT_MULTIPLE_CHOICE)

    response = _answer(client, exam["id"], question, "una risposta inventata")

    assert response.status_code == 422


def test_an_open_question_takes_whatever_the_student_writes(
    client: TestClient, session: Session
):
    """The rule that refuses an answer from outside the served options is about
    Closed Questions. An Open Question has none, and free text is the point."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    question = _first(exam, FORMAT_OPEN)

    assert _answer(client, exam["id"], question, "boh, il tannino, l'acidità").status_code == 200

    refetched = client.get(f"/quiz/exams/{exam['id']}").json()
    assert _find(refetched, question["question_id"])["answer"] == "boh, il tannino, l'acidità"


def test_an_open_answer_beyond_the_cap_is_refused_rather_than_truncated(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    question = _first(exam, FORMAT_OPEN)

    response = _answer(client, exam["id"], question, "a" * (MAX_OPEN_ANSWER_CHARS + 1))

    assert response.status_code == 422
    refetched = client.get(f"/quiz/exams/{exam['id']}").json()
    assert _find(refetched, question["question_id"])["answer"] is None


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
    _submit(client, exam["id"])
    with _grader():
        result = _grade(client, exam["id"])

    assert result["questions"][-1]["answer"] is None
    assert result["questions"][-1]["verdict"] == VERDICT_WRONG
    assert result["score"] == EXAM_LENGTH - 1


def test_an_exam_can_be_submitted_entirely_blank(client: TestClient, session: Session):
    """Submission is always possible: the player is never trapped in a Session
    they want to end. A blank Open Question is wrong without a model call —
    there is nothing in it for the agent to read."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    result = client.post(f"/quiz/exams/{exam['id']}/submit")

    assert result.status_code == 200
    assert result.json()["grading_complete"] is True
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


# ── Grading the Open Questions ────────────────────────────────────────────────

def test_handing_in_grades_the_closed_questions_and_leaves_the_open_ones_pending(
    client: TestClient, session: Session
):
    """The recap opens on the Closed Questions while the written answers are
    still with the agent, so handing in has to return them already graded."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    _fill_in(client, exam, correct=EXAM_LENGTH)

    handed_in = _submit(client, exam["id"])

    closed = [q for q in handed_in["questions"] if q["format"] != FORMAT_OPEN]
    open_questions = [q for q in handed_in["questions"] if q["format"] == FORMAT_OPEN]
    assert handed_in["status"] == STATUS_SUBMITTED
    assert all(q["verdict"] == VERDICT_CORRECT for q in closed)
    assert all(q["verdict"] is None for q in open_questions)
    assert handed_in["grading_complete"] is False


def test_a_paper_still_being_graded_emits_no_score(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    _fill_in(client, exam, correct=EXAM_LENGTH)

    handed_in = _submit(client, exam["id"])

    assert handed_in["score"] is None
    assert handed_in["score_pct"] is None
    assert handed_in["passed"] is None


def test_the_grading_agent_is_sent_what_it_needs_and_nothing_it_does_not(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    _fill_in(client, exam, correct=EXAM_LENGTH)
    _submit(client, exam["id"])

    seen: List[dict] = []
    with _grader(seen=seen):
        _grade(client, exam["id"], language="it")

    sent = seen[0]["items"]
    assert seen[0]["language"] == "it"
    assert len(sent) == EXAM_COMPOSITION[FORMAT_OPEN]
    for item in sent:
        question = session.get(Question, item.question_id)
        assert item.question == question.text
        assert item.reference_answer == question.reference_answer
        assert item.player_answer == f"una risposta {CORRECT_MARKER}"
        assert item.subtype in (SUBTYPE_CONCEPTUAL, SUBTYPE_LIST)
        assert item.subtype == question.open_subtype


def test_an_acceptable_open_answer_scores_and_an_unacceptable_one_does_not(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    result = _sit_exam(client, exam, correct=EXAM_LENGTH - 3)

    assert result["grading_complete"] is True
    assert result["score"] == EXAM_LENGTH - 3
    assert sum(1 for q in result["questions"] if q["verdict"] == VERDICT_WRONG) == 3


def test_a_graded_open_question_comes_back_with_the_reference_answer_and_the_note(
    client: TestClient, session: Session
):
    """A wrong Open Question leaves the recap knowing both what the answer was
    and what the student's own answer was missing."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    result = _sit_exam(client, exam, correct=0)

    wrong_open = [q for q in result["questions"] if q["format"] == FORMAT_OPEN]
    assert wrong_open
    for question in wrong_open:
        assert question["verdict"] == VERDICT_WRONG
        assert question["correct_answer"].endswith(CORRECT_MARKER)
        assert question["feedback"] == "[en] manca il nocciolo della risposta"


def test_a_wrong_closed_question_carries_no_note_at_all(
    client: TestClient, session: Session
):
    """The bank's own explanations stay unused in this scope (#16): a wrong
    Closed Question shows the correct answer and nothing else."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    result = _sit_exam(client, exam, correct=0)

    closed = [q for q in result["questions"] if q["format"] != FORMAT_OPEN]
    assert all(q["feedback"] is None for q in closed)
    assert SECRET_MARKER not in client.get(f"/quiz/exams/{exam['id']}").text


def test_a_grading_agent_that_is_down_leaves_the_paper_ungraded_with_no_score(
    client: TestClient, session: Session
):
    """A timeout must not fail a candidate. Nothing is graded wrong by default,
    no score is emitted, and the paper stays retryable."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    _fill_in(client, exam, correct=EXAM_LENGTH)
    _submit(client, exam["id"])

    with _grader(unavailable=True):
        _grade(client, exam["id"], expect=503)

    paper = client.get(f"/quiz/exams/{exam['id']}").json()
    assert paper["grading_complete"] is False
    assert paper["score"] is None
    assert paper["score_pct"] is None
    assert paper["passed"] is None
    open_questions = [q for q in paper["questions"] if q["format"] == FORMAT_OPEN]
    assert all(q["verdict"] is None for q in open_questions)


def test_a_retry_finishes_a_paper_the_agent_could_not(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    _fill_in(client, exam, correct=EXAM_LENGTH)
    _submit(client, exam["id"])
    with _grader(unavailable=True):
        _grade(client, exam["id"], expect=503)

    with _grader():
        result = _grade(client, exam["id"])

    assert result["grading_complete"] is True
    assert result["score"] == EXAM_LENGTH
    assert result["passed"] is True


def test_a_partly_graded_paper_keeps_what_came_back_and_only_retries_the_rest(
    client: TestClient, session: Session
):
    """A retry costs one short call, not fourteen."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    _fill_in(client, exam, correct=EXAM_LENGTH)
    _submit(client, exam["id"])
    open_ids = [q["question_id"] for q in exam["questions"] if q["format"] == FORMAT_OPEN]
    withheld = open_ids[:2]

    with _grader(ungraded=withheld):
        _grade(client, exam["id"], expect=503)

    half_graded = client.get(f"/quiz/exams/{exam['id']}").json()
    assert half_graded["score"] is None
    assert all(_find(half_graded, qid)["verdict"] is None for qid in withheld)
    assert all(
        _find(half_graded, qid)["verdict"] == VERDICT_CORRECT
        for qid in open_ids
        if qid not in withheld
    )

    seen: List[dict] = []
    with _grader(seen=seen):
        result = _grade(client, exam["id"])

    assert [item.question_id for item in seen[0]["items"]] == withheld
    assert result["grading_complete"] is True
    assert result["score"] == EXAM_LENGTH


def test_grading_a_paper_that_is_already_graded_asks_nobody_anything(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    _sit_exam(client, exam, correct=EXAM_LENGTH)

    seen: List[dict] = []
    with _grader(seen=seen):
        result = _grade(client, exam["id"])

    assert seen == []
    assert result["score"] == EXAM_LENGTH


def test_a_paper_not_yet_handed_in_cannot_be_graded(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    with _grader():
        _grade(client, exam["id"], expect=409)


def test_grading_someone_elses_paper_is_not_found(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    _submit(client, exam["id"])
    client.cookies.clear()
    _authenticate(client, OTHER_USER_PAYLOAD)

    with _grader():
        _grade(client, exam["id"], expect=404)


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


# ── Being interrupted ─────────────────────────────────────────────────────────
# A phone call must not cost twenty minutes of work, and a stray tap must not
# destroy the paper the call interrupted.

def test_reading_the_exam_in_progress_requires_authentication(
    client: TestClient, session: Session
):
    _seed_bank(session)
    client.cookies.clear()

    assert client.get("/quiz/exams/current").status_code == 401


def test_nothing_is_in_progress_before_the_first_exam(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)

    assert _current(client) is None


def test_the_exam_in_progress_is_surfaced_with_the_answers_already_given(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    answered = _first(exam, FORMAT_MULTIPLE_CHOICE)
    given = _correct_answer(answered)
    _answer(client, exam["id"], answered, given)

    current = _current(client)

    assert current["id"] == exam["id"]
    assert current["status"] == STATUS_IN_PROGRESS
    assert _find(current, answered["question_id"])["answer"] == given
    # Everything else is still blank: how far the paper got is readable from
    # the paper itself rather than from a count the backend keeps separately.
    assert sum(1 for q in current["questions"] if q["answer"]) == 1


def test_resuming_shows_the_same_served_option_order(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    current = _current(client)

    for question in exam["questions"]:
        assert _find(current, question["question_id"])["options"] == question["options"]


def test_the_exam_in_progress_of_another_player_is_never_surfaced(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _start_exam(client)

    _authenticate(client, OTHER_USER_PAYLOAD)

    assert _current(client) is None


def test_an_exam_in_progress_does_not_expire(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    row = session.get(ExamSession, exam["id"])
    row.started_at = datetime.now(timezone.utc) - timedelta(days=400)
    session.add(row)
    session.commit()

    current = _current(client)
    assert current["id"] == exam["id"]

    question = _first(exam, FORMAT_TRUE_FALSE)
    assert _answer(client, exam["id"], question, _correct_answer(question)).status_code == 200
    assert _submit(client, exam["id"])["status"] == STATUS_SUBMITTED


# ── One Session in progress at a time ─────────────────────────────────────────

def test_starting_a_second_exam_while_one_is_open_is_refused(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    response = client.post("/quiz/exams")

    assert response.status_code == 409
    assert response.json()["detail"] == "exam_in_progress"
    # Refused, not replaced: the paper the player was sitting is untouched.
    assert _current(client)["id"] == exam["id"]


def test_two_sessions_in_progress_are_refused_by_the_database_itself(
    client: TestClient, session: Session
):
    """The router checks before it draws, but a check followed by an insert is
    not a rule — two taps in two tabs both pass it. This is the rule."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    owner = session.get(ExamSession, exam["id"]).user_id

    session.add(ExamSession(user_id=owner, mode=MODE_EXAM, max_score=EXAM_LENGTH))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_a_second_session_is_allowed_once_the_first_is_no_longer_in_progress(
    client: TestClient, session: Session
):
    """The index constrains papers in progress and nothing else: a player has
    as many finished and abandoned papers as they have sat."""
    _seed_bank(session)
    _authenticate(client)
    first = _start_exam(client)
    _abandon(client, first["id"])
    second = _start_exam(client)
    _submit(client, second["id"])

    third = _start_exam(client)

    assert len({first["id"], second["id"], third["id"]}) == 3


def test_one_player_in_progress_does_not_block_another(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _start_exam(client)

    _authenticate(client, OTHER_USER_PAYLOAD)

    _start_exam(client)


def test_abandoning_frees_the_slot(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    first = _start_exam(client)

    abandoned = _abandon(client, first["id"])

    assert abandoned["status"] == "abandoned"
    assert _current(client) is None
    assert _start_exam(client)["id"] != first["id"]


def test_handing_in_frees_the_slot(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    first = _start_exam(client)

    _submit(client, first["id"])

    assert _current(client) is None
    assert _start_exam(client)["id"] != first["id"]


def test_an_abandoned_exam_can_no_longer_be_answered_or_submitted(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    question = _first(exam, FORMAT_TRUE_FALSE)

    _abandon(client, exam["id"])

    assert _answer(client, exam["id"], question, _correct_answer(question)).status_code == 409
    assert client.post(f"/quiz/exams/{exam['id']}/submit").status_code == 409


def test_an_abandoned_exam_never_reveals_the_correct_answers(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    _abandon(client, exam["id"])
    body = client.get(f"/quiz/exams/{exam['id']}").text

    assert SECRET_MARKER not in body
    for question in client.get(f"/quiz/exams/{exam['id']}").json()["questions"]:
        assert question["correct_answer"] is None
        assert question["verdict"] is None


def test_an_abandoned_exam_carries_no_score_and_was_never_handed_in(
    client: TestClient, session: Session
):
    """The mechanism by which abandoned and unsubmitted Sessions stay out of
    statistics: only a submitted Session has a score and a submission time."""
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)
    _fill_in(client, exam, correct=EXAM_LENGTH)

    abandoned = _abandon(client, exam["id"])

    assert abandoned["score"] is None
    assert abandoned["score_pct"] is None
    assert abandoned["passed"] is None
    assert abandoned["submitted_at"] is None
    assert abandoned["grading_complete"] is False

    row = session.get(ExamSession, exam["id"])
    assert row.status == STATUS_ABANDONED
    assert row.score is None
    assert row.submitted_at is None


def test_an_exam_that_is_not_in_progress_cannot_be_abandoned(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    submitted = _start_exam(client)
    _submit(client, submitted["id"])

    _abandon(client, submitted["id"], expect=409)

    abandoned = _start_exam(client)
    _abandon(client, abandoned["id"])
    _abandon(client, abandoned["id"], expect=409)


def test_abandoning_someone_elses_exam_is_not_found(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    exam = _start_exam(client)

    _authenticate(client, OTHER_USER_PAYLOAD)

    _abandon(client, exam["id"], expect=404)


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
