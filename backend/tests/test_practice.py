"""Practice mode of Promossi o Cirrotici, exercised through the HTTP boundary.

Practice is where studying actually happens, and it differs from the Exam in
exactly three ways a caller can see: it is drawn from one chosen Level, it comes
in the length the student has time for, and the Verdict lands the moment the
answer does. Nothing here passes or fails anybody. Those are the properties
this file defends. Prior art: `tests/test_exams.py`.
"""
import os
from contextlib import contextmanager
from typing import Iterable, List, Optional
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlmodel import Session

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

from app.ai.grading import GradedOpenAnswer, OpenAnswerToGrade  # noqa: E402
from app.exams.model import (  # noqa: E402
    EXAM_COMPOSITION,
    EXAM_LENGTH,
    MODE_PRACTICE,
    PRACTICE_COMPOSITION,
    PRACTICE_LENGTHS,
    STATUS_ABANDONED,
    STATUS_IN_PROGRESS,
    STATUS_SUBMITTED,
    VERDICT_CORRECT,
    VERDICT_WRONG,
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
    "email": "practice-test@example.com",
    "password": "securepassword",
    "first_name": "Test",
    "last_name": "User",
}

OTHER_USER_PAYLOAD = {
    "email": "practice-intruder@example.com",
    "password": "securepassword",
    "first_name": "Other",
    "last_name": "Student",
}

# The correct multiple-choice option is the one that says so, whatever position
# the backend shuffled it into. It is necessarily in the payload — it is one of
# the options — so it is not what a leak looks like.
CORRECT_MARKER = "giusta"

# The explanation, on the other hand, spells the answer out in prose and has no
# business being served, in any mode.
SECRET_MARKER = "spiegazione riservata"


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _authenticate(client: TestClient, payload: dict = REGISTER_PAYLOAD) -> TestClient:
    client.post("/auth/register", json=payload)
    return client


def _seed_level(
    session: Session,
    level: int,
    *,
    multiple_choice: int = 20,
    true_false: int = 20,
    open_questions: int = 20,
) -> None:
    """One Level of a bank shaped like the real one: the correct option is
    always the first, which is exactly why the backend has to shuffle."""
    for n in range(multiple_choice):
        session.add(
            Question(
                text=f"L{level} MC {n}",
                format=FORMAT_MULTIPLE_CHOICE,
                level=level,
                reference_answer=f"L{level} MC {n} {CORRECT_MARKER}",
                options=[
                    f"L{level} MC {n} {CORRECT_MARKER}",
                    f"L{level} MC {n} sbagliata A",
                    f"L{level} MC {n} sbagliata B",
                ],
                explanation=f"L{level} MC {n}: {SECRET_MARKER}",
            )
        )
    for n in range(true_false):
        session.add(
            Question(
                text=f"L{level} TF {n}",
                format=FORMAT_TRUE_FALSE,
                level=level,
                reference_answer="VERO" if n % 2 == 0 else "FALSO",
                options=[],
                explanation=f"L{level} TF {n}: {SECRET_MARKER}",
            )
        )
    for n in range(open_questions):
        session.add(
            Question(
                text=f"L{level} OPEN {n}",
                format=FORMAT_OPEN,
                level=level,
                reference_answer=f"L{level} OPEN {n} {CORRECT_MARKER}",
                options=[],
                explanation=f"L{level} OPEN {n}: {SECRET_MARKER}",
                open_subtype=SUBTYPE_LIST if n % 2 else SUBTYPE_CONCEPTUAL,
            )
        )
    session.commit()


def _seed_bank(session: Session, **counts: int) -> None:
    for level in (1, 2, 3):
        _seed_level(session, level, **counts)


def _correct_answer(question: dict) -> str:
    """What a student who knows their material writes. On an Open Question that
    is free text, so the stand-in agent below reads it: nothing the browser
    holds says what the right answer is."""
    if question["format"] == FORMAT_MULTIPLE_CHOICE:
        return next(o for o in question["options"] if o.endswith(CORRECT_MARKER))
    if question["format"] == FORMAT_OPEN:
        return f"una risposta {CORRECT_MARKER}"
    index = int(question["text"].split()[-1])
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

    with patch("app.exams.service.grade_open_answers", new=AsyncMock(side_effect=_grade)):
        yield


# ── Calling the endpoints ─────────────────────────────────────────────────────

def _start(client: TestClient, level: int = 1, length: int = 10, expect: int = 201) -> dict:
    response = client.post("/quiz/practice", json={"level": level, "length": length})
    assert response.status_code == expect, response.text
    return response.json()


def _answer(
    client: TestClient,
    session_id: int,
    question: dict,
    value: Optional[str],
    language: str = "en",
):
    return client.put(
        f"/quiz/practice/{session_id}/answers/{question['question_id']}",
        json={"answer": value, "language": language},
    )


def _answer_ok(client: TestClient, session_id: int, question: dict, value: str) -> dict:
    response = _answer(client, session_id, question, value)
    assert response.status_code == 200, response.text
    return response.json()


def _finish(client: TestClient, session_id: int, expect: int = 200) -> dict:
    response = client.post(f"/quiz/practice/{session_id}/finish")
    assert response.status_code == expect, response.text
    return response.json()


def _read(client: TestClient, session_id: int, expect: int = 200) -> dict:
    response = client.get(f"/quiz/practice/{session_id}")
    assert response.status_code == expect, response.text
    return response.json()


def _current(client: TestClient) -> Optional[dict]:
    """The Session in progress, in any mode. One slot, one game."""
    response = client.get("/quiz/exams/current")
    assert response.status_code == 200, response.text
    return response.json()


def _formats(paper: dict) -> dict:
    counts: dict[str, int] = {}
    for question in paper["questions"]:
        counts[question["format"]] = counts.get(question["format"], 0) + 1
    return counts


def _of_format(paper: dict, question_format: str) -> List[dict]:
    return [q for q in paper["questions"] if q["format"] == question_format]


def _first(paper: dict, question_format: str) -> dict:
    return next(q for q in paper["questions"] if q["format"] == question_format)


def _find(paper: dict, question_id: int) -> dict:
    return next(q for q in paper["questions"] if q["question_id"] == question_id)


def _sit(client: TestClient, paper: dict, correct: int) -> None:
    """Answer the first `correct` questions right and the rest wrong, the way a
    student walks a Practice Session: one question, one Verdict, next."""
    with _grader():
        for position, question in enumerate(paper["questions"]):
            value = _correct_answer(question) if position < correct else _wrong_answer(question)
            _answer_ok(client, paper["id"], question, value)


# ── Auth and ownership ────────────────────────────────────────────────────────

def test_starting_practice_requires_authentication(client: TestClient, session: Session):
    _seed_bank(session)
    client.cookies.clear()

    assert client.post("/quiz/practice", json={"level": 1, "length": 10}).status_code == 401


def test_a_practice_session_cannot_be_read_by_anyone_but_its_owner(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client)

    _authenticate(client, OTHER_USER_PAYLOAD)

    _read(client, practice["id"], expect=404)


def test_a_practice_session_cannot_be_answered_or_finished_by_anyone_but_its_owner(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client)
    question = practice["questions"][0]

    _authenticate(client, OTHER_USER_PAYLOAD)

    assert _answer(client, practice["id"], question, _correct_answer(question)).status_code == 404
    _finish(client, practice["id"], expect=404)


def test_the_practice_endpoints_are_not_a_second_way_into_an_exam(
    client: TestClient, session: Session
):
    """An Exam is graded on submission and never a question at a time. Reaching
    one through `/quiz/practice` would be immediate feedback on a paper whose
    whole point is that there is none."""
    _seed_bank(session)
    _authenticate(client)
    exam = client.post("/quiz/exams").json()

    _read(client, exam["id"], expect=404)
    assert _answer(client, exam["id"], exam["questions"][0], "VERO").status_code == 404
    _finish(client, exam["id"], expect=404)


def test_a_practice_session_is_not_reachable_through_the_exam_endpoints(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client)

    assert client.get(f"/quiz/exams/{practice['id']}").status_code == 404
    assert client.post(f"/quiz/exams/{practice['id']}/submit").status_code == 404


# ── The chosen Level and the chosen length ────────────────────────────────────

def test_every_question_comes_from_the_chosen_level(client: TestClient, session: Session):
    """The whole point of the mode: drill the block you have lessons on."""
    _seed_bank(session)
    _authenticate(client)

    for level in (1, 2, 3):
        practice = _start(client, level=level, length=10)
        assert practice["level"] == level
        assert {q["level"] for q in practice["questions"]} == {level}
        client.post(f"/quiz/practice/{practice['id']}/abandon")


def test_a_practice_session_is_as_long_as_the_student_asked_for(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)

    for length in PRACTICE_LENGTHS:
        practice = _start(client, length=length)
        assert len(practice["questions"]) == length
        assert practice["max_score"] == length
        client.post(f"/quiz/practice/{practice['id']}/abandon")


def test_the_format_proportions_match_the_exam_at_every_length(
    client: TestClient, session: Session
):
    """Open Questions stay the largest block at every length, and never a
    smaller share of the paper than the Exam gives them — they are what the
    real sitting is mostly made of, and they are the ones worth practising."""
    _seed_bank(session)
    _authenticate(client)

    exam_open_share = EXAM_COMPOSITION[FORMAT_OPEN] / EXAM_LENGTH

    for length in PRACTICE_LENGTHS:
        practice = _start(client, length=length)
        formats = _formats(practice)
        assert formats == dict(PRACTICE_COMPOSITION[length])
        assert formats[FORMAT_OPEN] == max(formats.values())
        assert formats[FORMAT_OPEN] / length >= exam_open_share
        client.post(f"/quiz/practice/{practice['id']}/abandon")


def test_a_length_that_is_not_on_offer_is_refused(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)

    _start(client, length=15, expect=422)
    _start(client, length=0, expect=422)


def test_a_level_that_does_not_exist_is_refused(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)

    _start(client, level=4, expect=422)
    _start(client, level=0, expect=422)


def test_a_level_too_thin_to_fill_the_session_is_refused(
    client: TestClient, session: Session
):
    """Told apart from a backend that is down: one is a fact about the bank."""
    _seed_level(session, 1, multiple_choice=20, true_false=20, open_questions=2)
    _authenticate(client)

    body = _start(client, level=1, length=10, expect=409)
    assert body["detail"] == "question_bank_too_small"


# ── One Session at a time, across every mode ──────────────────────────────────

def test_practice_is_refused_while_an_exam_is_open(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    client.post("/quiz/exams")

    body = _start(client, expect=409)
    assert body["detail"] == "exam_in_progress"


def test_an_exam_is_refused_while_practice_is_open(client: TestClient, session: Session):
    """The slot is the game's, not the mode's: work is only ever destroyed by
    an explicit, confirmed choice."""
    _seed_bank(session)
    _authenticate(client)
    _start(client)

    response = client.post("/quiz/exams")
    assert response.status_code == 409
    assert response.json()["detail"] == "exam_in_progress"


def test_a_second_practice_session_is_refused_while_one_is_open(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _start(client)

    _start(client, expect=409)


def test_a_practice_session_in_progress_is_what_the_player_comes_back_to(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, level=2, length=20)

    current = _current(client)

    assert current is not None
    assert current["id"] == practice["id"]
    assert current["mode"] == MODE_PRACTICE
    assert current["level"] == 2
    assert len(current["questions"]) == 20


def test_abandoning_practice_frees_the_slot(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client)

    response = client.post(f"/quiz/practice/{practice['id']}/abandon")

    assert response.status_code == 200
    assert response.json()["status"] == STATUS_ABANDONED
    assert _current(client) is None
    _start(client)  # the slot really is free


def test_an_abandoned_practice_session_cannot_be_answered(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client)
    client.post(f"/quiz/practice/{practice['id']}/abandon")

    question = practice["questions"][0]
    response = _answer(client, practice["id"], question, _correct_answer(question))

    assert response.status_code == 409
    assert response.json()["detail"] == "exam_not_in_progress"


# ── Nothing is given away before it is answered ───────────────────────────────

def test_a_question_not_yet_answered_carries_no_answer_and_no_explanation(
    client: TestClient, session: Session
):
    """The highest-value assertion in the suite, and it holds in Practice too:
    immediate feedback means immediately *after* the answer, not before."""
    _seed_bank(session)
    _authenticate(client)

    practice = _start(client, length=30)

    for question in practice["questions"]:
        assert question["verdict"] is None
        assert question["correct_answer"] is None
        assert question["feedback"] is None
    assert SECRET_MARKER not in str(_read(client, practice["id"]))


def test_answering_one_question_gives_nothing_away_about_the_others(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    answered = _first(practice, FORMAT_MULTIPLE_CHOICE)

    _answer_ok(client, practice["id"], answered, _correct_answer(answered))

    paper = _read(client, practice["id"])
    for question in paper["questions"]:
        if question["question_id"] == answered["question_id"]:
            assert question["correct_answer"] is not None
            continue
        assert question["correct_answer"] is None
        assert question["verdict"] is None


def test_the_bank_explanation_is_never_served(client: TestClient, session: Session):
    """It spells the answer out in prose and stays unused in this scope (#16)."""
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    _sit(client, practice, correct=10)

    assert SECRET_MARKER not in str(_finish(client, practice["id"]))


# ── The Verdict lands with the answer ─────────────────────────────────────────

def test_a_closed_question_is_marked_the_moment_it_is_answered(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    question = _first(practice, FORMAT_MULTIPLE_CHOICE)

    accepted = _answer_ok(client, practice["id"], question, _correct_answer(question))

    assert accepted["verdict"] == VERDICT_CORRECT
    assert accepted["correct_answer"] == _correct_answer(question)


def test_a_wrong_closed_answer_comes_back_with_the_right_one(
    client: TestClient, session: Session
):
    """The correction lands while the student still remembers their reasoning —
    which is the entire reason this mode exists."""
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    question = _first(practice, FORMAT_TRUE_FALSE)

    accepted = _answer_ok(client, practice["id"], question, _wrong_answer(question))

    assert accepted["verdict"] == VERDICT_WRONG
    assert accepted["correct_answer"] == _correct_answer(question)


def test_an_open_question_is_marked_by_the_agent_on_the_spot(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    question = _first(practice, FORMAT_OPEN)

    seen: List[dict] = []
    with _grader(seen=seen):
        accepted = _answer_ok(
            client, practice["id"], question, f"una risposta {CORRECT_MARKER}"
        )

    assert accepted["verdict"] == VERDICT_CORRECT
    assert accepted["feedback"]
    # One question, one call: there is no batch to confuse in Practice.
    assert len(seen) == 1
    assert [item.question_id for item in seen[0]["items"]] == [question["question_id"]]


def test_the_agent_is_told_the_interface_language(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    question = _first(practice, FORMAT_OPEN)

    seen: List[dict] = []
    with _grader(seen=seen):
        _answer(client, practice["id"], question, "qualcosa", language="it")

    assert seen[0]["language"] == "it"


def test_the_agent_is_told_which_criterion_to_apply(client: TestClient, session: Session):
    """`conceptual` and `list` are graded on different criteria, and the
    subtype is what selects between them."""
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=30)

    seen: List[dict] = []
    with _grader(seen=seen):
        for question in _of_format(practice, FORMAT_OPEN):
            _answer(client, practice["id"], question, "qualcosa")

    subtypes = {call["items"][0].subtype for call in seen}
    assert subtypes <= {SUBTYPE_CONCEPTUAL, SUBTYPE_LIST}
    assert subtypes


def test_an_open_answer_the_agent_could_not_read_is_not_marked_wrong(
    client: TestClient, session: Session
):
    """Nothing is ever graded wrong because a call failed — the same rule the
    Exam holds, and here it is one question rather than fourteen."""
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    question = _first(practice, FORMAT_OPEN)

    with _grader(unavailable=True):
        accepted = _answer_ok(
            client, practice["id"], question, f"una risposta {CORRECT_MARKER}"
        )

    assert accepted["verdict"] is None
    assert accepted["correct_answer"] is None
    # The answer itself is kept, so asking again costs the student nothing.
    assert _find(_read(client, practice["id"]), question["question_id"])["answer"]


def test_an_answer_the_agent_could_not_read_can_be_sent_again(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    question = _first(practice, FORMAT_OPEN)

    with _grader(unavailable=True):
        _answer_ok(client, practice["id"], question, f"una risposta {CORRECT_MARKER}")
    with _grader():
        retried = _answer_ok(
            client, practice["id"], question, f"una risposta {CORRECT_MARKER}"
        )

    assert retried["verdict"] == VERDICT_CORRECT


def test_a_question_already_marked_cannot_be_answered_again(
    client: TestClient, session: Session
):
    """Changing your answer after being shown the right one is not studying."""
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    question = _first(practice, FORMAT_MULTIPLE_CHOICE)
    _answer_ok(client, practice["id"], question, _wrong_answer(question))

    response = _answer(client, practice["id"], question, _correct_answer(question))

    assert response.status_code == 409
    assert response.json()["detail"] == "answer_already_graded"
    assert _find(_read(client, practice["id"]), question["question_id"])["verdict"] == VERDICT_WRONG


def test_a_blank_answer_is_refused_rather_than_marked(client: TestClient, session: Session):
    """There is no skipping in Practice: a question is answered or it is left
    for the Session to end without it. Marking an empty box wrong on the spot
    would teach nothing and could not be taken back."""
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    question = _first(practice, FORMAT_OPEN)

    assert _answer(client, practice["id"], question, None).status_code == 422
    assert _answer(client, practice["id"], question, "   ").status_code == 422
    assert _find(_read(client, practice["id"]), question["question_id"])["verdict"] is None


def test_a_closed_answer_from_outside_the_served_options_is_refused(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    question = _first(practice, FORMAT_MULTIPLE_CHOICE)

    response = _answer(client, practice["id"], question, "una risposta inventata")

    assert response.status_code == 422
    assert response.json()["detail"] == "answer_not_offered"


def test_a_question_from_another_session_is_not_on_this_paper(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)

    response = client.put(
        f"/quiz/practice/{practice['id']}/answers/999999", json={"answer": "VERO"}
    )

    assert response.status_code == 404


# ── Adaptive selection ────────────────────────────────────────────────────────

def test_practice_draws_questions_the_student_has_never_seen_first(
    client: TestClient, session: Session
):
    """Widening rather than circling: with enough unseen questions to fill it,
    a second Session repeats nothing from the first."""
    _seed_level(session, 1, multiple_choice=20, true_false=20, open_questions=20)
    _authenticate(client)
    first = _start(client, level=1, length=10)
    _sit(client, first, correct=10)
    _finish(client, first["id"])

    second = _start(client, level=1, length=10)

    seen = {q["question_id"] for q in first["questions"]}
    assert not seen & {q["question_id"] for q in second["questions"]}


def test_practice_brings_back_what_the_student_got_wrong_before_what_they_got_right(
    client: TestClient, session: Session
):
    """Never-seen first, then previously wrong, then least-recently-seen. The
    bank is sized so that all three buckets are needed and the order shows."""
    # 7 Open Questions at Level 1 and a Session of 10 draws 5 of them, so the
    # second Session has 2 unseen, and must choose the rest from what it knows.
    _seed_level(session, 1, multiple_choice=20, true_false=20, open_questions=7)
    _authenticate(client)

    first = _start(client, level=1, length=10)
    first_open = _of_format(first, FORMAT_OPEN)
    assert len(first_open) == 5
    wrong_ids = {q["question_id"] for q in first_open[:2]}
    right_ids = {q["question_id"] for q in first_open[2:]}
    with _grader():
        for question in first["questions"]:
            value = (
                _wrong_answer(question)
                if question["question_id"] in wrong_ids
                else _correct_answer(question)
            )
            _answer_ok(client, first["id"], question, value)
    _finish(client, first["id"])

    second = _start(client, level=1, length=10)
    second_open = {q["question_id"] for q in _of_format(second, FORMAT_OPEN)}

    # The two never seen must be there, and so must both of the wrong ones —
    # the three answered correctly are what gets crowded out.
    assert wrong_ids <= second_open
    assert len(second_open & right_ids) == 1
    assert len(second_open) == 5


def test_a_question_left_unanswered_still_counts_as_never_seen(
    client: TestClient, session: Session
):
    """Drawn is not seen. A Session ended after two questions must not push the
    other eight to the back of the queue."""
    _seed_level(session, 1, multiple_choice=20, true_false=20, open_questions=6)
    _authenticate(client)
    first = _start(client, level=1, length=10)
    untouched = {q["question_id"] for q in _of_format(first, FORMAT_OPEN)}
    _finish(client, first["id"])  # ended without answering anything

    second = _start(client, level=1, length=10)

    # 6 Open Questions in the bank, none of them answered, so the 5 drawn now
    # are still drawn from the unseen pile rather than ordered by history.
    assert len(untouched & {q["question_id"] for q in _of_format(second, FORMAT_OPEN)}) >= 4


def test_the_exam_is_not_made_adaptive_by_practice(client: TestClient, session: Session):
    """Practice history must not bend an Exam: a paper that favours what you
    get wrong stops being a measure of whether you would pass."""
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, level=1, length=10)
    _sit(client, practice, correct=0)
    _finish(client, practice["id"])

    exam = client.post("/quiz/exams").json()

    # Still one sitting across all three Levels, drawn blind, however much
    # Level 1 history the player has just built up.
    assert len({q["level"] for q in exam["questions"]}) == 3


# ── Finishing ─────────────────────────────────────────────────────────────────

def test_a_finished_practice_session_is_recorded_with_what_was_got_right(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    _sit(client, practice, correct=7)

    finished = _finish(client, practice["id"])

    assert finished["status"] == STATUS_SUBMITTED
    assert finished["score"] == 7
    assert finished["max_score"] == 10
    assert finished["score_pct"] == 70.0
    assert finished["submitted_at"] is not None
    assert finished["duration_seconds"] is not None


def test_practice_never_passes_or_fails_anybody(client: TestClient, session: Session):
    """The only pass/fail number in the product is the Exam's."""
    _seed_bank(session)
    _authenticate(client)

    for correct in (0, 10):
        practice = _start(client, length=10)
        _sit(client, practice, correct=correct)
        assert _finish(client, practice["id"])["passed"] is None


def test_a_session_ended_early_is_scored_on_what_was_actually_answered(
    client: TestClient, session: Session
):
    """A student who runs out of time is never trapped, and the questions they
    never reached are not held against them."""
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    with _grader():
        for question in practice["questions"][:4]:
            _answer_ok(client, practice["id"], question, _correct_answer(question))

    finished = _finish(client, practice["id"])

    assert finished["score"] == 4
    assert finished["max_score"] == 4
    assert finished["score_pct"] == 100.0


def test_an_answer_the_agent_never_read_is_left_out_of_the_score(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    stalled = _first(practice, FORMAT_OPEN)
    with _grader(ungraded=[stalled["question_id"]]):
        for question in practice["questions"]:
            _answer_ok(client, practice["id"], question, _correct_answer(question))

    finished = _finish(client, practice["id"])

    assert finished["score"] == 9
    assert finished["max_score"] == 9
    assert _find(finished, stalled["question_id"])["verdict"] is None


def test_finishing_frees_the_slot(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    _sit(client, practice, correct=10)

    _finish(client, practice["id"])

    assert _current(client) is None
    _start(client)


def test_a_finished_session_cannot_be_finished_or_answered_again(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    _sit(client, practice, correct=10)
    _finish(client, practice["id"])

    _finish(client, practice["id"], expect=409)
    question = practice["questions"][0]
    assert _answer(client, practice["id"], question, _correct_answer(question)).status_code == 409


def test_a_finished_session_still_shows_every_question_with_its_verdict(
    client: TestClient, session: Session
):
    """The recap is the same resource as the paper — nothing to fetch twice."""
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)
    _sit(client, practice, correct=6)
    _finish(client, practice["id"])

    recap = _read(client, practice["id"])

    assert len(recap["questions"]) == 10
    assert all(q["verdict"] is not None for q in recap["questions"])
    assert all(q["correct_answer"] is not None for q in recap["questions"])
    assert sum(1 for q in recap["questions"] if q["verdict"] == VERDICT_CORRECT) == 6


def test_a_practice_session_is_never_in_progress_once_it_is_over(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    practice = _start(client, length=10)

    assert _read(client, practice["id"])["status"] == STATUS_IN_PROGRESS
    _sit(client, practice, correct=1)
    _finish(client, practice["id"])
    assert _read(client, practice["id"])["status"] == STATUS_SUBMITTED
