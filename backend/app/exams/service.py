"""What every mode of Promossi o Cirrotici does the same way.

The Exam, Practice and Error Review are the same resource with a different
`mode`: one row in `exam_sessions`, one row per question in `exam_answers`,
drawn and graded by the backend (ADR 0007). Loading a Session, deciding what of
it the browser is allowed to see, shuffling the options, marking a Closed
Question, reading what a player has made of the bank so far and ending a
sitting are therefore written once, here, and the mode-specific rules — which
questions are drawn, and in what order — live in the routers.

The one rule this module exists to hold is what a payload may contain: **the
browser never holds the answer to a question it is still being asked.** The
Exam reveals everything when the paper is handed in; the modes with immediate
feedback reveal one question at a time, the moment that question carries a
Verdict. Both are the same condition, expressed once in `read_session`.
"""
import random
from datetime import datetime, timezone
from typing import Dict, List, NamedTuple, Optional

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import distinct, func
from sqlmodel import Session, select

from app.ai.grading import OpenAnswerToGrade, grade_open_answers
from app.exams.model import (
    MASTERY_SESSIONS,
    MAX_OPEN_ANSWER_CHARS,
    MODE_EXAM,
    PASS_MARK_PCT,
    STATUS_ABANDONED,
    STATUS_IN_PROGRESS,
    STATUS_SUBMITTED,
    TRUE_FALSE_OPTIONS,
    VERDICT_CORRECT,
    VERDICT_WRONG,
    ExamAnswer,
    ExamSession,
)
from app.questions.model import (
    FORMAT_MULTIPLE_CHOICE,
    FORMAT_OPEN,
    FORMAT_TRUE_FALSE,
    SUBTYPE_CONCEPTUAL,
    Question,
)


# ── Response schemas ──────────────────────────────────────────────────────────

class SessionQuestionRead(BaseModel):
    """One question of a Session as the player is allowed to see it.

    `correct_answer` and `feedback` stay `None` until the question is over —
    handed in with the paper in the Exam, answered and marked in Practice. A
    question still being asked never carries its own answer."""

    question_id: int
    position: int
    text: str
    format: str
    level: int
    options: List[str]
    topic: Optional[str]
    answer: Optional[str]
    verdict: Optional[str]
    correct_answer: Optional[str]
    # What the grading agent told the player about their answer. Open Questions
    # only, and only once graded. It is *never* the bank's own `explanation`,
    # which spells the answer out in prose and stays unused in this scope (#16):
    # a wrong Closed Question shows the correct answer and nothing else.
    feedback: Optional[str]


class SessionRead(BaseModel):
    id: int
    mode: str
    # The Level a Practice Session was drawn from. `None` on an Exam, which is
    # deliberately blind across all three.
    level: Optional[int]
    status: str
    max_score: int
    score: Optional[int]
    score_pct: Optional[float]
    # Whether the paper was passed — an Exam question only. Practice never
    # passes or fails anybody, so it answers `None` and the screen has nothing
    # to render even if it tried.
    passed: Optional[bool]
    # False while an answer that was actually given is still without a Verdict.
    # The Exam recap reads it to know the Closed Questions below it are the
    # whole story so far, and that there is no score yet.
    grading_complete: bool
    started_at: datetime
    submitted_at: Optional[datetime]
    duration_seconds: Optional[int]
    questions: List[SessionQuestionRead]


# ── Serialization ─────────────────────────────────────────────────────────────

def as_utc(moment: Optional[datetime]) -> Optional[datetime]:
    """Timestamps are written in UTC but the column is naive, so they come back
    from the database without a zone. Say so explicitly: the browser reads
    `started_at` to run the clock, and a bare ISO string is parsed as local
    time, which would put the elapsed time out by the whole offset."""
    if moment is None:
        return None
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment


def read_session(
    exam: ExamSession, answers: List[ExamAnswer], questions: Dict[int, Question]
) -> SessionRead:
    submitted = exam.status == STATUS_SUBMITTED

    # An answer that was given and has no Verdict is one the agent could not
    # read. A question nobody has reached yet is not outstanding — which is why
    # this counts answers rather than questions, and why a Practice Session
    # ended halfway is not reported as "still being marked".
    grading_complete = not any(
        answer.verdict is None and (answer.answer or "").strip() for answer in answers
    )
    if not submitted and exam.mode == MODE_EXAM:
        # Nothing about an Exam is settled until it is handed in, and no Exam
        # question carries a Verdict before then anyway.
        grading_complete = False

    scored = exam.score is not None and exam.max_score > 0
    # The percentage is for the screen; the verdict is decided on whole marks.
    # Rounding first would let a paper that fell just short of the mark round up
    # onto it — impossible over 30 questions, but Practice brings papers of 10
    # and 20 where it would not be.
    score_pct = round(exam.score / exam.max_score * 100, 1) if scored else None
    passed = (
        exam.score * 100 >= exam.max_score * PASS_MARK_PCT
        if scored and exam.mode == MODE_EXAM
        else None
    )

    return SessionRead(
        id=exam.id,
        mode=exam.mode,
        level=exam.level,
        status=exam.status,
        max_score=exam.max_score,
        score=exam.score,
        score_pct=score_pct,
        passed=passed,
        grading_complete=grading_complete,
        started_at=as_utc(exam.started_at),
        submitted_at=as_utc(exam.submitted_at),
        duration_seconds=exam.duration_seconds,
        questions=[
            _read_question(answer, questions[answer.question_id], submitted)
            for answer in sorted(answers, key=lambda a: a.position)
        ],
    )


def _read_question(
    answer: ExamAnswer, question: Question, submitted: bool
) -> SessionQuestionRead:
    # A question is over when it carries a Verdict, or when the whole paper has
    # been handed in. Until then nothing that gives the answer away is served —
    # in the Exam that is the entire sitting, in Practice it is one question.
    over = submitted or answer.verdict is not None

    return SessionQuestionRead(
        question_id=answer.question_id,
        position=answer.position,
        text=question.text,
        format=question.format,
        level=question.level,
        options=list(answer.served_options),
        topic=question.topic,
        answer=answer.answer,
        verdict=answer.verdict,
        correct_answer=question.reference_answer if over else None,
        feedback=answer.explanation if over else None,
    )


# ── Loading ───────────────────────────────────────────────────────────────────

def load_session(db: Session, exam_id: int, user_id: int, mode: str) -> ExamSession:
    """Somebody else's Session is not found rather than forbidden: whose a given
    id is is not the caller's business either. A Session of the wrong mode is
    not found for the same reason — the Practice endpoints are not a second way
    into an Exam."""
    exam = db.get(ExamSession, exam_id)
    if exam is None or exam.user_id != user_id or exam.mode != mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="exam_not_found")
    return exam


def in_progress_session(db: Session, user_id: int) -> Optional[ExamSession]:
    """The one Session the player has open, if any. There is at most one across
    every mode of the game: starting a second requires handing the first in or
    abandoning it, so no tap can ever silently destroy work."""
    return db.exec(
        select(ExamSession)
        .where(ExamSession.user_id == user_id, ExamSession.status == STATUS_IN_PROGRESS)
        .order_by(ExamSession.id.desc())  # type: ignore[union-attr]
        .limit(1)
    ).first()


def load_answers(db: Session, exam_id: int) -> List[ExamAnswer]:
    return list(
        db.exec(
            select(ExamAnswer)
            .where(ExamAnswer.session_id == exam_id)
            .order_by(ExamAnswer.position)  # type: ignore[arg-type]
        ).all()
    )


def load_questions(db: Session, answers: List[ExamAnswer]) -> Dict[int, Question]:
    ids = [a.question_id for a in answers]
    if not ids:
        return {}
    rows = db.exec(select(Question).where(Question.id.in_(ids))).all()  # type: ignore[attr-defined]
    return {q.id: q for q in rows}


# ── Serving ───────────────────────────────────────────────────────────────────

def serve_options(question: Question) -> List[str]:
    """In the source bank the correct option is always the first one, so the
    shuffle is a correctness requirement rather than a nicety. It happens once,
    when the Session is drawn, and is persisted: a resumed Session shows the
    same paper."""
    if question.format == FORMAT_MULTIPLE_CHOICE:
        options = list(question.options)
        random.shuffle(options)
        return options
    if question.format == FORMAT_TRUE_FALSE:
        return list(TRUE_FALSE_OPTIONS)
    return []


# ── Grading ───────────────────────────────────────────────────────────────────

def grade_closed(question: Question, answer: Optional[str]) -> str:
    """Exact comparison, no model call. Case and surrounding whitespace are not
    what is being tested."""
    if answer is None or not answer.strip():
        return VERDICT_WRONG
    correct = answer.strip().casefold() == question.reference_answer.strip().casefold()
    return VERDICT_CORRECT if correct else VERDICT_WRONG


# ── What the player has made of the bank ──────────────────────────────────────

class Attempt(NamedTuple):
    """The last thing this player did with one question. Named rather than a
    bare tuple because `history[q.id][0]` says nothing about what is being
    sorted on, and the sort is the whole point of an adaptive draw."""

    seen_at: int  # the answer's row id — see `history` on what it does and does not mean
    verdict: Optional[str]


def history(db: Session, user_id: int) -> Dict[int, Attempt]:
    """What this player has made of each question they have ever answered, as
    `question_id -> Attempt`.

    Only answers that were actually given count. A question that was drawn onto
    a Session and never reached has not been seen, and pushing it to the back
    of the queue would punish a student for stopping early.

    The answer id stands in for recency, and it is worth being exact about what
    that buys: an `exam_answers` row is written when the Session is *drawn* and
    only updated when the question is answered, so a higher id means a later
    Session — not a later keystroke. Recency is therefore at Session
    granularity, which is the granularity "least recently seen" means anyway;
    within one Session the order is the order the questions were drawn in, and
    nothing depends on it. Buying finer than that would cost a column and a
    migration to order questions inside a Session nobody is comparing.

    History is read across every mode and whatever became of the Session that
    asked, an abandoned one included: a question you got wrong in an Exam last
    week is exactly one Practice should bring back, and binning the Session it
    was asked in does not unmake the mistake.
    """
    rows = db.exec(
        select(ExamAnswer.question_id, ExamAnswer.id, ExamAnswer.verdict)
        .join(ExamSession, ExamAnswer.session_id == ExamSession.id)  # type: ignore[arg-type]
        .where(ExamSession.user_id == user_id, ExamAnswer.answer.is_not(None))  # type: ignore[union-attr]
        .order_by(ExamAnswer.id)  # type: ignore[arg-type]
    ).all()
    # Ordered by id, so the last row for a question is the one that survives.
    return {
        question_id: Attempt(seen_at=answer_id, verdict=verdict)
        for question_id, answer_id, verdict in rows
    }


def mastery_counts(db: Session, user_id: int) -> Dict[int, int]:
    """How many *distinct* Sessions this player has answered each question
    correctly in — `question_id -> count`, absent meaning none.

    Distinct Sessions, not correct answers: three right answers inside one
    sitting is the same memory used three times, and the rule exists to make
    "learned" mean coming back to a question on another day and still having
    it. `COUNT(DISTINCT session_id)` is the whole of that rule, and a question
    is answered at most once per Session anyway in the modes that mark as they
    go — the distinctness is what makes the rule survive a mode that did not.

    Counted from the answers themselves rather than from a column somebody
    increments. A counter and a history can disagree; this cannot, and a
    Session that is deleted takes its contribution with it.

    Only **submitted** Sessions count. An abandoned Session is one the player
    threw away, and credit towards a rule as strict as this one has to come
    from a sitting that was actually finished — while its mistakes stay on
    record in `history`, because binning a Session does not unmake them. Every
    mode counts: a question answered correctly in an Exam has been answered
    correctly, and the mode it happened in is not the student's problem.
    """
    rows = db.exec(
        select(
            ExamAnswer.question_id,
            func.count(distinct(ExamAnswer.session_id)),  # type: ignore[arg-type]
        )
        .join(ExamSession, ExamAnswer.session_id == ExamSession.id)  # type: ignore[arg-type]
        .where(
            ExamSession.user_id == user_id,
            ExamSession.status == STATUS_SUBMITTED,
            ExamAnswer.verdict == VERDICT_CORRECT,
        )
        .group_by(ExamAnswer.question_id)  # type: ignore[arg-type]
    ).all()
    return {question_id: count for question_id, count in rows}


def is_mastered(sessions_correct: int) -> bool:
    return sessions_correct >= MASTERY_SESSIONS


def exam_score_view(exam: ExamSession) -> Optional[tuple]:
    """The percentage and pass/fail of a scored Exam, or None when it has no
    score yet. Decided on whole marks, not the rounded percentage, so a paper
    that fell just short cannot round up onto the mark — the same rule
    `read_session` applies, kept here so the profile and the recap can never
    disagree about whether a paper passed."""
    if exam.score is None or exam.max_score <= 0:
        return None
    score_pct = round(exam.score / exam.max_score * 100, 1)
    passed = exam.score * 100 >= exam.max_score * PASS_MARK_PCT
    return score_pct, passed


# ── Marking an answer as it is given ──────────────────────────────────────────

class MarkedAnswerRead(BaseModel):
    """The answer to one question and what became of it — everything the screen
    needs to show the correction without refetching the whole Session.

    `verdict` is `None` only when the agent could not read a written answer.
    That is not a wrong answer and is never shown as one: the question keeps
    its answer, gives nothing away, and can simply be sent again."""

    question_id: int
    answer: Optional[str]
    verdict: Optional[str]
    correct_answer: Optional[str]
    feedback: Optional[str]


async def mark_answer(
    db: Session,
    exam: ExamSession,
    question_id: int,
    value: str,
    language: str,
) -> MarkedAnswerRead:
    """Records one answer and marks it on the spot — what Practice and Error
    Review both do, and what the Exam deliberately does not.

    A Closed Question is marked by comparison and comes straight back. A
    written one goes to the grading agent as a single item — there is no batch
    here to confuse, which is the one advantage of marking as you go.

    An answer is given once. Being shown the right answer and then being
    allowed to change yours is not studying, so a question that already carries
    a Verdict is closed. A written answer the agent could not read carries no
    Verdict and is therefore *not* closed: sending it again is the retry.
    """
    if exam.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_in_progress")

    answer = db.exec(
        select(ExamAnswer).where(
            ExamAnswer.session_id == exam.id, ExamAnswer.question_id == question_id
        )
    ).first()
    if answer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="question_not_in_exam")
    if answer.verdict is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="answer_already_graded"
        )

    value = value.strip()
    # There is no skipping in a mode that marks as it goes: a question is
    # answered, or it is left behind when the Session ends. Marking an empty box
    # wrong on the spot would teach nothing and could not be taken back.
    if not value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="answer_required"
        )
    if answer.served_options and value not in answer.served_options:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="answer_not_offered"
        )
    # Refused rather than truncated: silently cutting a student's answer in
    # half and then grading what is left is the worse of the two.
    if len(value) > MAX_OPEN_ANSWER_CHARS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="answer_too_long"
        )

    question = db.get(Question, question_id)
    answer.answer = value

    if question.format != FORMAT_OPEN:
        answer.verdict = grade_closed(question, value)
    else:
        graded = await grade_open_answers(
            [
                OpenAnswerToGrade(
                    question_id=question_id,
                    question=question.text,
                    reference_answer=question.reference_answer,
                    player_answer=value,
                    subtype=question.open_subtype or SUBTYPE_CONCEPTUAL,
                )
            ],
            language,
        )
        verdict = graded.get(question_id)
        if verdict is not None:
            answer.verdict = VERDICT_CORRECT if verdict.acceptable else VERDICT_WRONG
            answer.explanation = verdict.explanation

    db.add(answer)
    db.commit()
    db.refresh(answer)

    # Nothing is revealed until the question is over, and the Verdict is what
    # makes it over. An answer the agent never read gives away nothing.
    marked = answer.verdict is not None
    return MarkedAnswerRead(
        question_id=question_id,
        answer=answer.answer,
        verdict=answer.verdict,
        correct_answer=question.reference_answer if marked else None,
        feedback=answer.explanation if marked else None,
    )


# ── Ending a Session that marked as it went ───────────────────────────────────

def settle_marked_score(exam: ExamSession, answers: List[ExamAnswer]) -> None:
    """A mode that marks as it goes is scored on what was actually marked, and
    on nothing else.

    A question never reached and an answer the agent could not read are both
    left out of the total rather than counted wrong — the first was not
    attempted, and the second must never be failed for a model's sake. So a
    Session ended after four questions reads "4 out of 4", which is the truth
    about it. There is no pass mark to distort: `passed` is `None` outside the
    Exam whatever the number says.

    This overwrites the length the Session was drawn at, and deliberately: after
    the fact, "how many did I get right" is about the questions that were
    marked. The chosen length is not lost by it — one `exam_answers` row exists
    per question drawn, so `len(answers)` is still what the student asked for,
    and anything reporting on Sessions later reads it from there rather than
    from `max_score`.
    """
    marked = [answer for answer in answers if answer.verdict is not None]
    exam.max_score = len(marked)
    exam.score = sum(1 for answer in marked if answer.verdict == VERDICT_CORRECT)


def finish_marked_session(db: Session, exam: ExamSession) -> List[ExamAnswer]:
    """Ends the Session and records it.

    Always possible, and never a trap: a student who runs out of time after
    four questions ends on four questions, and is scored on those four. The
    Session is submitted, which is what makes its correct answers count towards
    the Mastered rule — and it is not an `exam` row, so it stays out of the
    Exam history."""
    if exam.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_in_progress")

    answers = load_answers(db, exam.id)

    submitted_at = datetime.now(timezone.utc)
    started = exam.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)

    exam.status = STATUS_SUBMITTED
    exam.submitted_at = submitted_at
    exam.duration_seconds = max(0, int((submitted_at - started).total_seconds()))
    settle_marked_score(exam, answers)
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return answers


def abandon_open_session(db: Session, exam: ExamSession) -> List[ExamAnswer]:
    """Throws the Session away and frees the slot.

    Distinct from finishing: an abandoned Session has no score and no
    submission time, so it never reaches statistics and never builds mastery.
    The answers already given stay on record, because what a player got wrong is
    worth keeping whatever became of the Session that asked it."""
    if exam.status != STATUS_IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="exam_not_in_progress")

    exam.status = STATUS_ABANDONED
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return load_answers(db, exam.id)
