"""The verification around the grading agent (ADR 0010).

A typed schema stops malformed output. It does not stop a well-formed Verdict
returned against the wrong question, and it does not stop a prompt carrying
fourteen reference answers from diluting into one. This file is about what
happens after the model has replied — so the model call itself is patched at
its import site inside `app.ai.grading`, the way `tests/test_ai.py` patches the
Gemini calls, and no test here ever reaches a model.
"""
from typing import List
from unittest.mock import AsyncMock, patch

import pytest

from app.ai.grading import GradedOpenAnswer, OpenAnswerToGrade, grade_open_answers
from app.questions.model import SUBTYPE_CONCEPTUAL, SUBTYPE_LIST


def _items(*ids: int) -> List[OpenAnswerToGrade]:
    return [
        OpenAnswerToGrade(
            question_id=question_id,
            question=f"Domanda {question_id}?",
            reference_answer=f"Risposta di riferimento {question_id}",
            player_answer=f"Risposta dello studente {question_id}",
            subtype=SUBTYPE_LIST if question_id % 2 else SUBTYPE_CONCEPTUAL,
        )
        for question_id in ids
    ]


def _verdict(question_id: int, acceptable: bool = True) -> GradedOpenAnswer:
    return GradedOpenAnswer(
        question_id=question_id, acceptable=acceptable, explanation="motivazione"
    )


def _replies(*batches):
    """Scripts the model: one entry per call, in order. A callable entry is
    called with the items so a test can answer whatever it was asked."""
    scripted = list(batches)

    async def _run(items, language):
        reply = scripted.pop(0)
        return reply(items) if callable(reply) else reply

    return AsyncMock(side_effect=_run)


@pytest.mark.asyncio
async def test_a_complete_batch_is_taken_as_it_comes():
    runs = _replies([_verdict(1), _verdict(2, acceptable=False), _verdict(3)])

    with patch("app.ai.grading.run_batch", new=runs):
        graded = await grade_open_answers(_items(1, 2, 3), "en")

    assert runs.await_count == 1, "a complete batch must not be re-asked"
    assert set(graded) == {1, 2, 3}
    assert graded[2].acceptable is False


@pytest.mark.asyncio
async def test_an_item_the_batch_left_out_is_asked_again_on_its_own():
    runs = _replies(
        [_verdict(1), _verdict(3)],
        lambda items: [_verdict(items[0].question_id, acceptable=False)],
    )

    with patch("app.ai.grading.run_batch", new=runs):
        graded = await grade_open_answers(_items(1, 2, 3), "en")

    assert runs.await_count == 2
    assert [item.question_id for item in runs.await_args_list[1].args[0]] == [2]
    assert set(graded) == {1, 2, 3}
    assert graded[2].acceptable is False


@pytest.mark.asyncio
async def test_a_verdict_carrying_the_wrong_question_id_is_thrown_away():
    """The failure a schema cannot catch: well-formed, confident, and about the
    question next door. It is discarded and the real one is asked again."""
    runs = _replies(
        [_verdict(1), _verdict(99, acceptable=False), _verdict(3)],
        lambda items: [_verdict(items[0].question_id)],
    )

    with patch("app.ai.grading.run_batch", new=runs):
        graded = await grade_open_answers(_items(1, 2, 3), "en")

    assert 99 not in graded
    assert set(graded) == {1, 2, 3}
    assert graded[2].acceptable is True


@pytest.mark.asyncio
async def test_a_second_verdict_on_the_same_question_is_ignored():
    runs = _replies([_verdict(1), _verdict(1, acceptable=False), _verdict(2)])

    with patch("app.ai.grading.run_batch", new=runs):
        graded = await grade_open_answers(_items(1, 2), "en")

    assert graded[1].acceptable is True


@pytest.mark.asyncio
async def test_a_batch_that_raises_falls_back_to_one_call_per_question():
    async def _run(items, language):
        if len(items) > 1:
            raise RuntimeError("the model timed out")
        return [_verdict(items[0].question_id)]

    with patch("app.ai.grading.run_batch", new=AsyncMock(side_effect=_run)):
        graded = await grade_open_answers(_items(1, 2, 3), "en")

    assert set(graded) == {1, 2, 3}


@pytest.mark.asyncio
async def test_nothing_is_ever_graded_unacceptable_because_a_call_failed():
    """The rule the whole design turns on: a model that is down produces no
    Verdicts at all, never a paper full of failures."""
    with patch(
        "app.ai.grading.run_batch", new=AsyncMock(side_effect=RuntimeError("down"))
    ):
        graded = await grade_open_answers(_items(1, 2, 3), "en")

    assert graded == {}


@pytest.mark.asyncio
async def test_a_single_question_call_answering_the_wrong_question_is_refused():
    runs = _replies([], [_verdict(42)], [_verdict(2)], [_verdict(3)])

    with patch("app.ai.grading.run_batch", new=runs):
        graded = await grade_open_answers(_items(1, 2, 3), "en")

    assert set(graded) == {2, 3}, "the item answered with id 42 stays ungraded"


@pytest.mark.asyncio
async def test_an_empty_paper_asks_nobody_anything():
    runs = _replies()

    with patch("app.ai.grading.run_batch", new=runs):
        assert await grade_open_answers([], "it") == {}

    assert runs.await_count == 0


@pytest.mark.asyncio
async def test_the_interface_language_is_passed_through_to_every_call():
    runs = _replies([_verdict(1)], lambda items: [_verdict(items[0].question_id)])

    with patch("app.ai.grading.run_batch", new=runs):
        await grade_open_answers(_items(1, 2), "it")

    assert [call.args[1] for call in runs.await_args_list] == ["it", "it"]
