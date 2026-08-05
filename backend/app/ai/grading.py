"""Grading of Open Questions, through a PydanticAI agent (ADR 0010).

This is the only AI call in the product whose output is load-bearing — it
decides a pass or a fail — so it is the only one that does not go through
`app.ai.gemini`. The rule is in the ADR: structured, load-bearing output runs
on PydanticAI; conversational output stays on `google-genai`.

Two things a typed schema does not protect against, and this module does:

* a well-formed Verdict returned against the wrong question. Every item carries
  its question id both ways, and the returned set is checked against the sent
  set. Anything missing, duplicated or unrecognised is re-graded with a
  single-question call, where there is nothing to confuse.
* a Verdict invented out of a failure. Nothing here ever produces "not
  acceptable" because a call raised — an item that could not be graded is
  simply absent from the result, and the caller leaves the paper ungraded.
"""
import asyncio
import json
import os
from typing import Dict, List

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider

from app.questions.model import SUBTYPE_CONCEPTUAL, SUBTYPE_LIST

MODEL_NAME = "gemini-3.1-flash-lite"


class OpenAnswerToGrade(BaseModel):
    """One Open Question of a submitted paper, as the grader needs to see it."""

    question_id: int
    question: str
    reference_answer: str
    player_answer: str
    # `conceptual` or `list` — it is what selects the criterion
    # (docs/question-bank-classification.md).
    subtype: str


class GradedOpenAnswer(BaseModel):
    """The Verdict on one Open Question. Binary on purpose: the Exam has no
    partial credit, so a grader allowed to hedge would only be inventing one."""

    question_id: int = Field(description="the id of the question being graded")
    acceptable: bool = Field(description="true if the answer would be accepted")
    explanation: str = Field(
        description="one or two sentences for the player, in the interface language"
    )


class GradedBatch(BaseModel):
    graded: List[GradedOpenAnswer]


INSTRUCTIONS = """\
You are "il Tannino", the examiner of Tannino Incazzato, an anti-snob wine-learning app.
You are grading the written answers of a sommelier-course exam paper.

You will receive a list of items. Grade every single one and return exactly one result per
item, carrying the same question_id you were given. Never merge two items, never invent an
item, never skip one.

The criterion depends on the subtype of the question:

- subtype "conceptual": the answer is acceptable when it covers the core of the reference
  answer, in any wording. Synonyms, paraphrase, a student's own words, a different order,
  extra detail, imperfect spelling and missing accents are all fine. What is not fine is a
  missing or wrong core concept. Do not require the reference answer's phrasing.
- subtype "list": the answer is acceptable when it names at least as many valid items as the
  question asks for. If the question states a number ("name three…"), that is the number
  required. If it states no number, a majority of the items in the reference answer is
  required. Count only items that are genuinely valid; count an item once. In the explanation
  always report the count achieved against the count required, e.g. "3 of the 5 required".

An empty, evasive or off-topic answer is not acceptable.

The explanation is written for the player, in the interface language you are told to use.
Be direct, brief and a little cheeky, never pretentious and never lecturing — one short
sentence, two at most. When an answer is not acceptable, say specifically what it was
missing. When it is acceptable, say so plainly. Do not quote the reference answer back in
full: the player is shown it already.

The questions and the reference answers are in Italian and stay in Italian. Only your
explanation follows the interface language.
"""


def _agent() -> Agent[None, GradedBatch]:
    """Built per call rather than at import: the key is read from the
    environment, and importing this module must not require one."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    model = GoogleModel(MODEL_NAME, provider=GoogleProvider(api_key=api_key))
    return Agent(model, output_type=GradedBatch, instructions=INSTRUCTIONS)


def _prompt(items: List[OpenAnswerToGrade], language: str) -> str:
    lang = "Italian" if language == "it" else "English"
    payload = [
        {
            "question_id": item.question_id,
            "question": item.question,
            "reference_answer": item.reference_answer,
            "player_answer": item.player_answer,
            "subtype": item.subtype if item.subtype in (SUBTYPE_CONCEPTUAL, SUBTYPE_LIST)
            else SUBTYPE_CONCEPTUAL,
        }
        for item in items
    ]
    return (
        f"Write your explanations in {lang}.\n"
        f"Grade these {len(payload)} answers and return one result for each:\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )


async def run_batch(items: List[OpenAnswerToGrade], language: str) -> List[GradedOpenAnswer]:
    """One model call. Raises on failure — verifying and recovering is
    `grade_open_answers`' job, not this one's."""
    result = await _agent().run(_prompt(items, language))
    return list(result.output.graded)


async def _run_batch_or_nothing(
    items: List[OpenAnswerToGrade], language: str
) -> List[GradedOpenAnswer]:
    try:
        return await run_batch(items, language)
    except Exception:
        # A model that is down, slow or malformed leaves the paper ungraded.
        # It must never leave it graded wrong.
        return []


async def grade_open_answers(
    items: List[OpenAnswerToGrade], language: str
) -> Dict[int, GradedOpenAnswer]:
    """Grade every Open Question of one submitted paper.

    One batched call for the whole paper, then a single-question call for
    anything the batch did not come back with — a prompt carrying fourteen
    reference answers, some of them long, is exactly where a model starts
    answering the question next door.

    Returns only the Verdicts that can be trusted, keyed by question id. A
    caller that gets back fewer than it sent has a paper it cannot grade yet.
    """
    if not items:
        return {}

    requested = {item.question_id: item for item in items}
    graded: Dict[int, GradedOpenAnswer] = {}

    for result in await _run_batch_or_nothing(items, language):
        # An id nobody asked about, or a second Verdict on one already graded,
        # is a grader that lost track of the paper. Neither is kept.
        if result.question_id in requested and result.question_id not in graded:
            graded[result.question_id] = result

    missing = [item for item in items if item.question_id not in graded]
    if not missing:
        return graded

    retries = await asyncio.gather(
        *(_run_batch_or_nothing([item], language) for item in missing)
    )
    for item, results in zip(missing, retries):
        # A single-question call answers that question or it answers nothing.
        for result in results:
            if result.question_id == item.question_id:
                graded[item.question_id] = result
                break

    return graded
