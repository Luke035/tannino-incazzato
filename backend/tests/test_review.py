"""Error Review and the Mastered rule, exercised through the HTTP boundary.

Two things are being defended here, and they are the whole issue (#23).

The **pool**: Error Review draws from the player's own questions and only the
ones that are not yet Mastered — not from the bank, not from a Level. It is
finite and it shrinks, so emptying it is winning and an empty pool is a
designed state rather than an error, and a pool shorter than the length asked
for is served as it is rather than refused.

The **rule**: a question is Mastered after three correct answers given in three
*distinct* Sessions. Three inside one sitting count once. Correct answers from
every mode count. Mastery is derived from the stored answers, so a Session that
was abandoned never bought any and a Session that is deleted takes its
contribution with it.

Prior art: `tests/test_practice.py`.
"""
import os
from contextlib import contextmanager
from typing import Iterable, List, Optional
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlmodel import Session, select

os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

from app.ai.grading import GradedOpenAnswer, OpenAnswerToGrade  # noqa: E402
from app.exams.model import (  # noqa: E402
    MASTERY_SESSIONS,
    MODE_REVIEW,
    REVIEW_LENGTHS,
    STATUS_ABANDONED,
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
    SUBTYPE_CONCEPTUAL,
    SUBTYPE_LIST,
    Question,
)

REGISTER_PAYLOAD = {
    "email": "review-test@example.com",
    "password": "securepassword",
    "first_name": "Test",
    "last_name": "User",
}

OTHER_USER_PAYLOAD = {
    "email": "review-intruder@example.com",
    "password": "securepassword",
    "first_name": "Other",
    "last_name": "Student",
}

CORRECT_MARKER = "giusta"
SECRET_MARKER = "spiegazione riservata"

# A Level seeded to exactly the shape of the shortest Practice Session, so that
# one sitting covers the whole Level and the pool is knowable to the question.
LEVEL_SHAPE = {"multiple_choice": 4, "true_false": 1, "open_questions": 5}
LEVEL_SIZE = sum(LEVEL_SHAPE.values())

# A bank of exactly one Exam paper — 14 open, 11 multiple choice, 5 true/false —
# with Level 1 shaped like the shortest Practice Session. An Exam then draws the
# whole bank and a Practice Session draws the whole of Level 1, so what a player
# has answered is knowable to the question in the tests that mix the modes.
EXAM_SIZED_LEVELS = {
    1: {"multiple_choice": 4, "true_false": 1, "open_questions": 5},
    2: {"multiple_choice": 4, "true_false": 2, "open_questions": 5},
    3: {"multiple_choice": 3, "true_false": 2, "open_questions": 4},
}
EXAM_SIZED_BANK = sum(sum(shape.values()) for shape in EXAM_SIZED_LEVELS.values())


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _authenticate(client: TestClient, payload: dict = REGISTER_PAYLOAD) -> TestClient:
    client.post("/auth/register", json=payload)
    return client


def _seed_level(
    session: Session,
    level: int,
    *,
    multiple_choice: int = 4,
    true_false: int = 1,
    open_questions: int = 5,
) -> None:
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
        _seed_level(session, level, **(counts or LEVEL_SHAPE))


def _seed_exam_sized_bank(session: Session) -> None:
    for level, shape in EXAM_SIZED_LEVELS.items():
        _seed_level(session, level, **shape)


def _correct_answer(question: dict) -> str:
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

@contextmanager
def _grader(*, unavailable: bool = False, ungraded: Iterable[int] = ()):
    withheld = set(ungraded)

    async def _grade(items: List[OpenAnswerToGrade], language: str):
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

    # Patched at both import sites: the modes that mark as they go call it
    # through `service`, the Exam batches the whole paper through its own
    # router. No test in this file ever reaches a model.
    stub = AsyncMock(side_effect=_grade)
    with patch("app.exams.service.grade_open_answers", new=stub), patch(
        "app.exams.router.grade_open_answers", new=stub
    ):
        yield


# ── Calling the endpoints ─────────────────────────────────────────────────────

def _pool(client: TestClient) -> dict:
    response = client.get("/quiz/review/pool")
    assert response.status_code == 200, response.text
    return response.json()


def _pending(client: TestClient) -> int:
    return _pool(client)["pending"]


def _start(client: TestClient, length: int = 10, expect: int = 201) -> dict:
    response = client.post("/quiz/review", json={"length": length})
    assert response.status_code == expect, response.text
    return response.json()


def _answer(client: TestClient, session_id: int, question: dict, value: Optional[str]):
    return client.put(
        f"/quiz/review/{session_id}/answers/{question['question_id']}",
        json={"answer": value, "language": "en"},
    )


def _answer_ok(client: TestClient, session_id: int, question: dict, value: str) -> dict:
    response = _answer(client, session_id, question, value)
    assert response.status_code == 200, response.text
    return response.json()


def _read(client: TestClient, session_id: int, expect: int = 200) -> dict:
    response = client.get(f"/quiz/review/{session_id}")
    assert response.status_code == expect, response.text
    return response.json()


def _finish(client: TestClient, session_id: int, expect: int = 200) -> dict:
    response = client.post(f"/quiz/review/{session_id}/finish")
    assert response.status_code == expect, response.text
    return response.json()


def _abandon(client: TestClient, session_id: int, expect: int = 200) -> dict:
    response = client.post(f"/quiz/review/{session_id}/abandon")
    assert response.status_code == expect, response.text
    return response.json()


def _ids(paper: dict) -> set:
    return {question["question_id"] for question in paper["questions"]}


# ── Building a history to review ──────────────────────────────────────────────

def _sit_practice(
    client: TestClient,
    *,
    level: int = 1,
    length: int = 10,
    correct: Optional[set] = None,
    finish: bool = True,
) -> dict:
    """One Practice Session, answered right on `correct` (every question when
    it is None) and wrong everywhere else. This is how a player's record — and
    therefore their Error Review pool — comes to exist at all."""
    paper = client.post("/quiz/practice", json={"level": level, "length": length}).json()
    with _grader():
        for question in paper["questions"]:
            right = correct is None or question["question_id"] in correct
            value = _correct_answer(question) if right else _wrong_answer(question)
            response = client.put(
                f"/quiz/practice/{paper['id']}/answers/{question['question_id']}",
                json={"answer": value, "language": "en"},
            )
            assert response.status_code == 200, response.text
    if finish:
        assert client.post(f"/quiz/practice/{paper['id']}/finish").status_code == 200
    return paper


def _sit_exam(client: TestClient, *, correct: bool = True) -> dict:
    """One Exam, sat and graded. Its Verdicts count towards mastery exactly like
    anybody else's — the mode a question was answered correctly in is not the
    student's problem."""
    paper = client.post("/quiz/exams").json()
    for question in paper["questions"]:
        value = _correct_answer(question) if correct else _wrong_answer(question)
        response = client.put(
            f"/quiz/exams/{paper['id']}/answers/{question['question_id']}",
            json={"answer": value},
        )
        assert response.status_code == 200, response.text
    assert client.post(f"/quiz/exams/{paper['id']}/submit").status_code == 200
    with _grader():
        assert client.post(
            f"/quiz/exams/{paper['id']}/grade", json={"language": "en"}
        ).status_code == 200
    return paper


# ── Auth and ownership ────────────────────────────────────────────────────────

def test_error_review_requires_authentication(client: TestClient, session: Session):
    _seed_bank(session)
    client.cookies.clear()

    assert client.get("/quiz/review/pool").status_code == 401
    assert client.post("/quiz/review", json={"length": 10}).status_code == 401


def test_an_error_review_session_cannot_be_read_by_anyone_but_its_owner(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)
    review = _start(client)

    client.cookies.clear()
    _authenticate(client, OTHER_USER_PAYLOAD)

    assert client.get(f"/quiz/review/{review['id']}").status_code == 404


def test_a_practice_session_is_not_reachable_through_the_review_endpoints(
    client: TestClient, session: Session
):
    """Each mode owns its own Sessions. The review endpoints are not a second
    way into a Practice Session, and say `not found` rather than explaining."""
    _seed_bank(session)
    _authenticate(client)
    paper = _sit_practice(client, finish=False)

    assert client.get(f"/quiz/review/{paper['id']}").status_code == 404


# ── The pool ──────────────────────────────────────────────────────────────────

def test_a_player_who_has_answered_nothing_has_an_empty_pool(
    client: TestClient, session: Session
):
    """Not an error and not a blank screen: the answer is zero, and the screen
    turns it into "go and practise"."""
    _seed_bank(session)
    _authenticate(client)

    assert _pool(client) == {"pending": 0, "mastery_sessions": MASTERY_SESSIONS}


def test_an_empty_pool_refuses_a_session_rather_than_drawing_an_empty_one(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)

    response = client.post("/quiz/review", json={"length": 10})
    assert response.status_code == 409
    assert response.json()["detail"] == "nothing_to_review"


def test_the_pool_is_only_the_questions_this_player_has_answered(
    client: TestClient, session: Session
):
    """The bank holds three Levels; the pool holds the ten questions this
    student has actually met. Error Review is about their record, not about
    what a syllabus says they ought to know."""
    _seed_bank(session)
    _authenticate(client)
    practised = _ids(_sit_practice(client, level=1))

    assert _pending(client) == LEVEL_SIZE
    assert _ids(_start(client)) == practised


def test_a_question_drawn_but_never_answered_is_not_in_the_pool(
    client: TestClient, session: Session
):
    """A student who stopped after three questions owes the other seven
    nothing: they were never asked."""
    _seed_bank(session)
    _authenticate(client)

    paper = client.post("/quiz/practice", json={"level": 1, "length": 10}).json()
    reached = paper["questions"][:3]
    with _grader():
        for question in reached:
            client.put(
                f"/quiz/practice/{paper['id']}/answers/{question['question_id']}",
                json={"answer": _wrong_answer(question), "language": "en"},
            )
    client.post(f"/quiz/practice/{paper['id']}/finish")

    assert _pending(client) == 3
    assert _ids(_start(client)) == {q["question_id"] for q in reached}


def test_a_deactivated_question_leaves_the_pool(client: TestClient, session: Session):
    """Withdrawn from the bank is withdrawn from everybody, including from the
    student who still owed it three right answers."""
    _seed_bank(session)
    _authenticate(client)
    paper = _sit_practice(client, level=1)

    retired = session.get(Question, paper["questions"][0]["question_id"])
    retired.active = False
    session.add(retired)
    session.commit()

    assert _pending(client) == LEVEL_SIZE - 1


# ── The Mastered rule, from both sides ────────────────────────────────────────

def test_the_rule_is_three_correct_sessions(client: TestClient, session: Session):
    """The literal, written down once. Every other test in this file expresses
    the boundary through `MASTERY_SESSIONS` so that it reads as the rule rather
    than as arithmetic — which means the number itself has to be pinned
    somewhere, or a one-character change would slip past the whole file. The
    screens are told it too, so that "three sessions" is never hardcoded in a
    translation string."""
    _seed_bank(session)
    _authenticate(client)

    assert MASTERY_SESSIONS == 3
    assert _pool(client)["mastery_sessions"] == 3


def test_two_correct_sessions_are_not_enough_to_master_a_question(
    client: TestClient, session: Session
):
    """One short of the rule. The boundary is tested from below here and from
    above in the next test, because an off-by-one in either direction is the
    only way this rule can be got wrong."""
    _seed_bank(session)
    _authenticate(client)
    for _ in range(MASTERY_SESSIONS - 1):
        _sit_practice(client, level=1)

    assert _pending(client) == LEVEL_SIZE
    assert len(_start(client)["questions"]) == LEVEL_SIZE


def test_the_third_correct_session_masters_a_question(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    for _ in range(MASTERY_SESSIONS):
        _sit_practice(client, level=1)

    assert _pending(client) == 0
    assert client.post("/quiz/review", json={"length": 10}).status_code == 409


def test_three_correct_answers_inside_one_session_count_once(
    client: TestClient, session: Session
):
    """The rule is three *distinct* Sessions, and this is the case it exists
    for: answering the same question right three times in one sitting is one
    memory used three times, and it does not make a question Mastered.

    The duplicate rows are written directly because no endpoint will produce
    them — a question that carries a Verdict is closed. That is the belt; this
    test is the braces, and it is what stops the rule being quietly rewritten
    as `COUNT(*)` by somebody optimising the query.
    """
    _seed_bank(session)
    _authenticate(client)
    paper = _sit_practice(client, level=1)
    target = paper["questions"][0]["question_id"]

    for _ in range(MASTERY_SESSIONS - 1):
        session.add(
            ExamAnswer(
                session_id=paper["id"],
                question_id=target,
                position=99,
                served_options=[],
                answer="ancora giusta",
                verdict=VERDICT_CORRECT,
            )
        )
    session.commit()

    assert _pending(client) == LEVEL_SIZE
    assert target in _ids(_start(client))


def test_correct_answers_from_the_exam_count_towards_mastery(
    client: TestClient, session: Session
):
    """Every mode counts. A student who got a question right twice in Practice
    and then again in an Exam has got it right three times, and Error Review is
    not going to keep asking just because it was not the mode that asked."""
    _seed_exam_sized_bank(session)
    _authenticate(client)
    for _ in range(MASTERY_SESSIONS - 1):
        _sit_practice(client, level=1)
    assert _pending(client) == LEVEL_SIZE

    # The Exam draws this whole bank, so it is the third correct Session for
    # the Level 1 ten — and the first for everything else.
    _sit_exam(client)

    assert _pending(client) == EXAM_SIZED_BANK - LEVEL_SIZE


def test_a_wrong_answer_does_not_undo_mastery_but_a_missing_session_does(
    client: TestClient, session: Session
):
    """Mastery is three correct Sessions, not a streak: it is not lost by a bad
    day. It *is* recomputed from the answers, so a Session that no longer
    exists takes its contribution with it."""
    _seed_bank(session)
    _authenticate(client)
    sittings = [_sit_practice(client, level=1) for _ in range(MASTERY_SESSIONS)]
    assert _pending(client) == 0

    discarded = session.get(ExamSession, sittings[0]["id"])
    for answer in session.exec(
        select(ExamAnswer).where(ExamAnswer.session_id == discarded.id)
    ).all():
        session.delete(answer)
    session.delete(discarded)
    session.commit()

    assert _pending(client) == LEVEL_SIZE


def test_an_abandoned_session_buys_no_mastery_but_keeps_its_mistakes(
    client: TestClient, session: Session
):
    """A Session the player threw away never finished, so nothing in it earns
    credit towards a rule this strict. What it asked stays on record all the
    same — binning the Session does not unmake the mistake."""
    _seed_bank(session)
    _authenticate(client)
    for _ in range(MASTERY_SESSIONS - 1):
        _sit_practice(client, level=1)

    paper = _sit_practice(client, level=1, finish=False)
    assert client.post(f"/quiz/practice/{paper['id']}/abandon").status_code == 200

    assert _pending(client) == LEVEL_SIZE

    _sit_practice(client, level=1)
    assert _pending(client) == 0


def test_a_review_session_that_is_abandoned_leaves_the_pool_untouched(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    for _ in range(MASTERY_SESSIONS - 1):
        _sit_practice(client, level=1)

    review = _start(client)
    with _grader():
        for question in review["questions"]:
            _answer_ok(client, review["id"], question, _correct_answer(question))
    ended = _abandon(client, review["id"])

    assert ended["status"] == STATUS_ABANDONED
    assert ended["pending"] == LEVEL_SIZE
    assert _pending(client) == LEVEL_SIZE


# ── Drawing the Session ───────────────────────────────────────────────────────

def test_a_pool_smaller_than_the_requested_length_serves_what_exists(
    client: TestClient, session: Session
):
    """Refusing to show a student their last four mistakes because they asked
    for ten would be absurd."""
    _seed_bank(session)
    _authenticate(client)

    paper = client.post("/quiz/practice", json={"level": 1, "length": 10}).json()
    answered = paper["questions"][:4]
    with _grader():
        for question in answered:
            client.put(
                f"/quiz/practice/{paper['id']}/answers/{question['question_id']}",
                json={"answer": _wrong_answer(question), "language": "en"},
            )
    client.post(f"/quiz/practice/{paper['id']}/finish")

    review = _start(client, length=30)
    assert len(review["questions"]) == 4
    assert review["max_score"] == 4


def test_the_wrong_ones_are_drawn_first_when_the_pool_is_longer_than_the_session(
    client: TestClient, session: Session
):
    """The mode is called Error Review. When it has to choose, it chooses the
    mistakes."""
    _seed_bank(session, multiple_choice=7, true_false=3, open_questions=10)
    _authenticate(client)
    first = _sit_practice(client, level=1, length=20)
    got_wrong = set(list(_ids(first))[:6])
    second = _sit_practice(client, level=1, length=20, correct=_ids(first) - got_wrong)
    assert _ids(second) == _ids(first)

    review = _start(client, length=10)
    assert got_wrong <= _ids(review)


def test_a_length_that_is_not_on_offer_is_refused(client: TestClient, session: Session):
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)

    for length in (0, 5, 15, 40):
        assert length not in REVIEW_LENGTHS
        response = client.post("/quiz/review", json={"length": length})
        assert response.status_code == 422
        assert response.json()["detail"] == "length_not_offered"


def test_an_error_review_session_is_not_drawn_from_one_level(
    client: TestClient, session: Session
):
    """No Level and no format composition: the player's own record already
    chose the questions, and reshaping it into an exam paper would throw away
    the only thing the mode knows."""
    _seed_exam_sized_bank(session)
    _authenticate(client)
    _sit_exam(client, correct=False)

    review = _start(client, length=30)
    assert review["level"] is None
    assert {question["level"] for question in review["questions"]} == {1, 2, 3}


def test_only_one_session_is_open_at_a_time_across_every_mode(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)
    _start(client)

    response = client.post("/quiz/review", json={"length": 10})
    assert response.status_code == 409
    assert response.json()["detail"] == "exam_in_progress"

    assert client.post("/quiz/practice", json={"level": 1, "length": 10}).status_code == 409
    assert client.post("/quiz/exams").status_code == 409


def test_the_open_session_is_reported_by_the_shared_current_endpoint(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)
    review = _start(client)

    current = client.get("/quiz/exams/current").json()
    assert current["id"] == review["id"]
    assert current["mode"] == MODE_REVIEW


# ── The number of questions still waiting ─────────────────────────────────────

def test_the_pool_count_is_on_the_session_and_moves_as_it_is_worked_through(
    client: TestClient, session: Session
):
    """Visible before the Session — that is `/pool` — and visible during it,
    which is this. The number is what progress looks like in this mode, so it
    is on every payload and recomputed rather than remembered."""
    _seed_bank(session)
    _authenticate(client)
    for _ in range(MASTERY_SESSIONS - 1):
        _sit_practice(client, level=1)

    review = _start(client)
    assert review["pending"] == LEVEL_SIZE
    # Answering does not master anything on its own: mastery is counted in
    # submitted Sessions, so the credit lands when the Session is finished.
    with _grader():
        for question in review["questions"]:
            _answer_ok(client, review["id"], question, _correct_answer(question))
    assert _read(client, review["id"])["pending"] == LEVEL_SIZE

    assert _finish(client, review["id"])["pending"] == 0
    assert _pending(client) == 0


def test_a_partly_answered_review_session_shrinks_the_pool_by_what_it_settled(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    for _ in range(MASTERY_SESSIONS - 1):
        _sit_practice(client, level=1)

    review = _start(client)
    settled = review["questions"][:3]
    with _grader():
        for question in settled:
            _answer_ok(client, review["id"], question, _correct_answer(question))

    finished = _finish(client, review["id"])
    assert finished["pending"] == LEVEL_SIZE - 3


# ── Feedback lands with the answer ────────────────────────────────────────────

def test_the_verdict_and_the_correct_answer_come_back_with_the_answer(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)
    review = _start(client)
    question = next(q for q in review["questions"] if q["format"] != FORMAT_OPEN)

    marked = _answer_ok(client, review["id"], question, _wrong_answer(question))
    assert marked["verdict"] == VERDICT_WRONG
    assert marked["correct_answer"] is not None


def test_a_written_answer_is_marked_by_the_agent_with_its_note(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)
    review = _start(client)
    question = next(q for q in review["questions"] if q["format"] == FORMAT_OPEN)

    with _grader():
        marked = _answer_ok(client, review["id"], question, _correct_answer(question))
    assert marked["verdict"] == VERDICT_CORRECT
    assert marked["feedback"]


def test_an_answer_the_agent_could_not_read_is_not_a_wrong_answer(
    client: TestClient, session: Session
):
    """Never failed for a model's sake: no Verdict, nothing revealed, and the
    question stays open so that sending it again is the retry."""
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)
    review = _start(client)
    question = next(q for q in review["questions"] if q["format"] == FORMAT_OPEN)

    with _grader(unavailable=True):
        stalled = _answer_ok(client, review["id"], question, _correct_answer(question))
    assert stalled["verdict"] is None
    assert stalled["correct_answer"] is None

    with _grader():
        retried = _answer_ok(client, review["id"], question, _correct_answer(question))
    assert retried["verdict"] == VERDICT_CORRECT


def test_a_question_that_carries_a_verdict_cannot_be_answered_again(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)
    review = _start(client)
    question = next(q for q in review["questions"] if q["format"] != FORMAT_OPEN)

    _answer_ok(client, review["id"], question, _wrong_answer(question))
    response = _answer(client, review["id"], question, _correct_answer(question))
    assert response.status_code == 409
    assert response.json()["detail"] == "answer_already_graded"


def test_an_unanswered_question_carries_none_of_its_answer(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)
    review = _start(client)

    for question in review["questions"]:
        assert question["correct_answer"] is None
        assert question["feedback"] is None
    assert SECRET_MARKER not in _read(client, review["id"]).__str__()


# ── Nothing here passes or fails anybody ──────────────────────────────────────

def test_an_error_review_session_never_passes_or_fails(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)
    review = _start(client)
    with _grader():
        for question in review["questions"]:
            _answer_ok(client, review["id"], question, _wrong_answer(question))

    finished = _finish(client, review["id"])
    assert finished["passed"] is None
    assert finished["status"] == STATUS_SUBMITTED
    assert finished["score"] == 0


def test_a_session_ended_early_is_scored_on_what_was_marked(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)
    review = _start(client)
    with _grader():
        for question in review["questions"][:4]:
            _answer_ok(client, review["id"], question, _correct_answer(question))

    finished = _finish(client, review["id"])
    assert (finished["score"], finished["max_score"]) == (4, 4)
    # The length it was drawn at is not lost: one row per question drawn.
    assert len(finished["questions"]) == LEVEL_SIZE


def test_a_finished_session_cannot_be_finished_or_answered_again(
    client: TestClient, session: Session
):
    _seed_bank(session)
    _authenticate(client)
    _sit_practice(client)
    review = _start(client)
    _finish(client, review["id"])

    _finish(client, review["id"], expect=409)
    response = _answer(client, review["id"], review["questions"][0], "VERO")
    assert response.status_code == 409
    assert response.json()["detail"] == "exam_not_in_progress"
