import type { Page } from '@playwright/test';
import { DENOMINATIONS } from '../fixtures/denominations';
import { HINT_RESPONSE, MEMORIZE_TIP_RESPONSE, REVIEW_RESPONSE } from '../fixtures/aiResponses';
import { EMPTY_STATS, ONE_SESSION_STATS } from '../fixtures/sessionStats';
import {
  CORRECT_OPTION,
  EXAM_ID,
  ExamFixture,
  OPEN_FEEDBACK,
  examInProgress,
} from '../fixtures/exam';
import {
  PRACTICE_CORRECT,
  PRACTICE_FEEDBACK_RIGHT,
  PRACTICE_FEEDBACK_WRONG,
  PRACTICE_ID,
  PracticeFixture,
  practiceInProgress,
} from '../fixtures/practice';
import {
  REVIEW_CORRECT,
  REVIEW_FEEDBACK_RIGHT,
  REVIEW_FEEDBACK_WRONG,
  REVIEW_ID,
  REVIEW_MASTERY_SESSIONS,
  REVIEW_PENDING,
  ReviewFixture,
  reviewInProgress,
} from '../fixtures/review';

const MOCK_USER = { id: 1, email: 'e2e-test@sommelier.test', first_name: 'Test', last_name: 'User' };

export type StatsVariant = 'empty' | 'one-session';

// Intercepts all backend API calls and returns deterministic fixture data.
// Call this before navigating to any page.
export async function mockApi(
  page: Page,
  options?: {
    denominations?: typeof DENOMINATIONS;
    statsVariant?: StatsVariant;
    // Starts the spec with a paper already drawn, and optionally with answers
    // already on it — what a student who was interrupted comes back to.
    exam?: ExamFixture | null;
    // Makes the bank look too thin to fill a paper.
    examRefused?: boolean;
    // Makes the backend fail rather than refuse — a different thing to be told.
    examBroken?: boolean;
    // The paper is binned somewhere else in the moment before it is handed in,
    // so the submission is refused and the paper is gone.
    abandonedElsewhere?: boolean;
    // How the grading agent behaves on the written answers: 'down' never grades
    // them, 'downOnce' fails the first request and grades on the retry.
    grader?: 'ok' | 'down' | 'downOnce';
    // Starts the spec with a Practice Session already open, and optionally with
    // some of it already answered — what a student who was interrupted comes
    // back to.
    practice?: PracticeFixture | null;
    // Makes the chosen Level look too thin to fill a Session of that length.
    practiceRefused?: boolean;
    // The grading agent on a written *Practice* answer, which is marked one
    // question at a time rather than a paper at a time. 'downOnce' stalls the
    // first written answer and marks it on the retry.
    practiceGrader?: 'ok' | 'down' | 'downOnce';
    // Starts the spec with an Error Review Session already open, and optionally
    // with some of it already answered.
    review?: ReviewFixture | null;
    // The pool is empty — the student has mastered everything they have been
    // asked, which is the mode working rather than failing.
    reviewEmpty?: boolean;
    // The grading agent on a written Error Review answer, marked one question
    // at a time exactly as in Practice.
    reviewGrader?: 'ok' | 'down' | 'downOnce';
  }
): Promise<void> {
  const denoms = options?.denominations ?? DENOMINATIONS;
  const statsData = options?.statsVariant === 'one-session' ? ONE_SESSION_STATS : EMPTY_STATS;

  // The Exam is a stateful resource, so the mock is a small server rather than
  // a fixed payload: the answers a spec gives have to come back on a refetch,
  // and the score has to follow from them.
  let exam: ExamFixture | null = options?.exam ?? null;
  let gradingRequests = 0;

  // The other mode of the same game. There is one Session in progress across
  // both, which is exactly the rule the specs have to be able to exercise, so
  // the two live side by side in this one mock rather than in two.
  let practice: PracticeFixture | null = options?.practice ?? null;
  let practiceGradingRequests = 0;

  // The third mode, on the same one slot. `pending` is the whole state of it:
  // it is what the screens read, and it only moves when a Session is finished,
  // because mastery is counted in submitted Sessions.
  let review: ReviewFixture | null = options?.review ?? null;
  let reviewGradingRequests = 0;
  let pending = options?.reviewEmpty ? 0 : (options?.review?.pending ?? REVIEW_PENDING);

  const inProgress = (): ExamFixture | PracticeFixture | ReviewFixture | null => {
    if (exam?.status === 'in_progress') return exam;
    if (practice?.status === 'in_progress') return practice;
    if (review?.status === 'in_progress') return review;
    return null;
  };

  // A paper has a score only once every question on it carries a Verdict —
  // the same rule the backend applies, and the reason the recap can show the
  // Closed Questions while the written ones are still with the agent.
  const settle = (paper: ExamFixture) => {
    paper.grading_complete = paper.questions.every((q) => q.verdict !== null);
    if (!paper.grading_complete) {
      paper.score = null;
      paper.score_pct = null;
      paper.passed = null;
      return;
    }
    paper.score = paper.questions.filter((q) => q.verdict === 'correct').length;
    paper.score_pct = Math.round((paper.score / paper.max_score) * 1000) / 10;
    paper.passed = paper.score_pct >= 60;
  };

  await page.route(/\/quiz\/exams/, (route) => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ contentType: 'application/json', status, body: JSON.stringify(body) });

    // Same guard as the Practice route below: an API path has no locale in
    // front of it, and anything that does is the browser navigating.
    if (!path.startsWith('/quiz/exams')) return route.fallback();

    // The Session in progress, in whichever mode, or nothing. Only an
    // in-progress Session holds the slot: a submitted or an abandoned one has
    // already freed it.
    if (method === 'GET' && path.endsWith('/quiz/exams/current')) {
      return json(inProgress());
    }

    if (method === 'POST' && path.endsWith('/quiz/exams')) {
      if (options?.examBroken) {
        return json({ detail: 'internal_server_error' }, 500);
      }
      if (options?.examRefused) {
        return json({ detail: 'question_bank_too_small' }, 409);
      }
      // Refused rather than replacing it: one Session in progress at a time
      // across every mode, and no tap destroys work the player already has.
      if (inProgress()) {
        return json({ detail: 'exam_in_progress' }, 409);
      }
      exam = examInProgress();
      return json(exam, 201);
    }

    if (!exam || !path.includes(`/quiz/exams/${EXAM_ID}`)) {
      return json({ detail: 'exam_not_found' }, 404);
    }

    if (method === 'PUT') {
      const questionId = Number(path.split('/').pop());
      const answer = (route.request().postDataJSON() as { answer: string | null }).answer;
      const question = exam.questions.find((q) => q.question_id === questionId);
      if (question) question.answer = answer;
      return json({ question_id: questionId, answer });
    }

    if (method === 'POST' && path.endsWith('/abandon')) {
      if (exam.status !== 'in_progress') {
        return json({ detail: 'exam_not_in_progress' }, 409);
      }
      exam.status = 'abandoned';
      return json(exam);
    }

    // Handing in grades the Closed Questions and nothing else: a written answer
    // that was actually written goes to the agent, a blank one is wrong on
    // the spot.
    if (method === 'POST' && path.endsWith('/submit')) {
      if (options?.abandonedElsewhere) {
        exam.status = 'abandoned';
        return json({ detail: 'exam_not_in_progress' }, 409);
      }
      for (const question of exam.questions) {
        question.correct_answer = CORRECT_OPTION[question.question_id];
        if (question.format === 'open' && question.answer) continue;
        question.verdict =
          question.answer === CORRECT_OPTION[question.question_id] ? 'correct' : 'wrong';
      }
      exam.status = 'submitted';
      exam.submitted_at = new Date().toISOString();
      exam.duration_seconds = 92;
      settle(exam);
      return json(exam);
    }

    if (method === 'POST' && path.endsWith('/grade')) {
      gradingRequests += 1;
      const down =
        options?.grader === 'down' || (options?.grader === 'downOnce' && gradingRequests === 1);

      if (!down) {
        for (const question of exam.questions) {
          if (question.format !== 'open' || question.verdict) continue;
          const correct = question.answer === CORRECT_OPTION[question.question_id];
          question.verdict = correct ? 'correct' : 'wrong';
          question.feedback = correct ? 'Ci siamo.' : OPEN_FEEDBACK;
        }
      }
      settle(exam);
      // Short of Verdicts: no score, and the paper stays retryable.
      return exam.grading_complete ? json(exam) : json({ detail: 'grading_incomplete' }, 503);
    }

    return json(exam);
  });

  // Practice is stateful in a different way from the Exam: the Verdict lands
  // with the answer rather than at the end, so this mock marks one question at
  // a time exactly as the backend does.
  await page.route(/\/quiz\/practice/, (route) => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ contentType: 'application/json', status, body: JSON.stringify(body) });

    // The game's own screens live at `/{locale}/quiz/practice`, which this
    // pattern matches just as happily as the API call it is meant for. An API
    // path has no locale in front of it — anything that does is the browser
    // navigating, and must be let through untouched.
    if (!path.startsWith('/quiz/practice')) return route.fallback();

    if (method === 'POST' && path.endsWith('/quiz/practice')) {
      if (options?.practiceRefused) {
        return json({ detail: 'question_bank_too_small' }, 409);
      }
      if (inProgress()) {
        return json({ detail: 'exam_in_progress' }, 409);
      }
      practice = practiceInProgress();
      const body = route.request().postDataJSON() as { level: number; length: number };
      practice.level = body.level as 1 | 2 | 3;
      for (const question of practice.questions) question.level = practice.level;
      return json(practice, 201);
    }

    if (!practice || !path.includes(`/quiz/practice/${PRACTICE_ID}`)) {
      return json({ detail: 'exam_not_found' }, 404);
    }

    // Answering *is* asking to be marked, so this returns the correction
    // rather than a bare acknowledgement — the one thing that makes Practice
    // Practice.
    if (method === 'PUT') {
      if (practice.status !== 'in_progress') {
        return json({ detail: 'exam_not_in_progress' }, 409);
      }
      const questionId = Number(path.split('/').pop());
      const answer = (route.request().postDataJSON() as { answer: string }).answer;
      const question = practice.questions.find((one) => one.question_id === questionId);
      if (!question) return json({ detail: 'question_not_in_exam' }, 404);
      // A question already marked is closed: being shown the answer and then
      // being allowed to change yours is not studying.
      if (question.verdict !== null) {
        return json({ detail: 'answer_already_graded' }, 409);
      }
      question.answer = answer;

      if (question.format === 'open') {
        practiceGradingRequests += 1;
        const down =
          options?.practiceGrader === 'down' ||
          (options?.practiceGrader === 'downOnce' && practiceGradingRequests === 1);
        // A written answer the agent could not read is left unmarked. It is
        // never turned into a wrong answer, and it gives nothing away.
        if (down) {
          return json({
            question_id: questionId,
            answer,
            verdict: null,
            correct_answer: null,
            feedback: null,
          });
        }
      }

      const correct = answer === PRACTICE_CORRECT[questionId];
      question.verdict = correct ? 'correct' : 'wrong';
      question.correct_answer = PRACTICE_CORRECT[questionId];
      if (question.format === 'open') {
        question.feedback = correct ? PRACTICE_FEEDBACK_RIGHT : PRACTICE_FEEDBACK_WRONG;
      }
      return json({
        question_id: questionId,
        answer,
        verdict: question.verdict,
        correct_answer: question.correct_answer,
        feedback: question.feedback,
      });
    }

    if (method === 'POST' && path.endsWith('/abandon')) {
      if (practice.status !== 'in_progress') {
        return json({ detail: 'exam_not_in_progress' }, 409);
      }
      practice.status = 'abandoned';
      return json(practice);
    }

    // Scored on what was actually marked, and on nothing else: a Session ended
    // after four questions reads "4 out of 4", which is the truth about it.
    if (method === 'POST' && path.endsWith('/finish')) {
      if (practice.status !== 'in_progress') {
        return json({ detail: 'exam_not_in_progress' }, 409);
      }
      const marked = practice.questions.filter((one) => one.verdict !== null);
      practice.status = 'submitted';
      practice.max_score = marked.length;
      practice.score = marked.filter((one) => one.verdict === 'correct').length;
      practice.score_pct = marked.length
        ? Math.round((practice.score / marked.length) * 1000) / 10
        : null;
      practice.submitted_at = new Date().toISOString();
      practice.duration_seconds = 74;
      // Every question the student was shown the answer to now carries it.
      for (const one of practice.questions) {
        one.correct_answer = PRACTICE_CORRECT[one.question_id];
      }
      return json(practice);
    }

    return json(practice);
  });

  await page.route('**/auth/me', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  );

  await page.route('**/denominations', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(denoms) })
  );

  await page.route('**/hint', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(HINT_RESPONSE) })
  );

  await page.route('**/memorize', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MEMORIZE_TIP_RESPONSE) })
  );

  // Mappa dei Vini's end-of-game write-up. The pattern also matches the quiz's
  // Error Review paths and the browser navigating to `/{locale}/quiz/review`,
  // and either of those being answered with a write-up is a page that never
  // loads — so anything under `/quiz` is passed straight back.
  await page.route('**/review', (route) => {
    if (new URL(route.request().url()).pathname.includes('/quiz/review')) {
      return route.fallback();
    }
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(REVIEW_RESPONSE) });
  });


  // Error Review, registered *after* `**/review` above so that it wins: that
  // pattern is Mappa dei Vini's end-of-game write-up and matches this path just
  // as happily, and Playwright gives the most recently added route first
  // refusal.
  await page.route(/\/quiz\/review/, (route) => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ contentType: 'application/json', status, body: JSON.stringify(body) });

    // The game's own screens live at `/{locale}/quiz/review`, which this
    // pattern matches too. An API path has no locale in front of it.
    if (!path.startsWith('/quiz/review')) return route.fallback();

    // How much is left to learn. Zero is a real answer, not an error.
    if (method === 'GET' && path.endsWith('/quiz/review/pool')) {
      return json({ pending, mastery_sessions: REVIEW_MASTERY_SESSIONS });
    }

    if (method === 'POST' && path.endsWith('/quiz/review')) {
      // An empty pool is refused, and the screen turns that into the
      // congratulation it is rather than an error.
      if (pending === 0) {
        return json({ detail: 'nothing_to_review' }, 409);
      }
      if (inProgress()) {
        return json({ detail: 'exam_in_progress' }, 409);
      }
      review = reviewInProgress();
      review.pending = pending;
      return json(review, 201);
    }

    if (!review || !path.includes(`/quiz/review/${REVIEW_ID}`)) {
      return json({ detail: 'exam_not_found' }, 404);
    }

    if (method === 'PUT') {
      if (review.status !== 'in_progress') {
        return json({ detail: 'exam_not_in_progress' }, 409);
      }
      const questionId = Number(path.split('/').pop());
      const answer = (route.request().postDataJSON() as { answer: string }).answer;
      const question = review.questions.find((one) => one.question_id === questionId);
      if (!question) return json({ detail: 'question_not_in_exam' }, 404);
      if (question.verdict !== null) {
        return json({ detail: 'answer_already_graded' }, 409);
      }
      question.answer = answer;

      if (question.format === 'open') {
        reviewGradingRequests += 1;
        const down =
          options?.reviewGrader === 'down' ||
          (options?.reviewGrader === 'downOnce' && reviewGradingRequests === 1);
        if (down) {
          return json({
            question_id: questionId,
            answer,
            verdict: null,
            correct_answer: null,
            feedback: null,
          });
        }
      }

      const correct = answer === REVIEW_CORRECT[questionId];
      question.verdict = correct ? 'correct' : 'wrong';
      question.correct_answer = REVIEW_CORRECT[questionId];
      if (question.format === 'open') {
        question.feedback = correct ? REVIEW_FEEDBACK_RIGHT : REVIEW_FEEDBACK_WRONG;
      }
      return json({
        question_id: questionId,
        answer,
        verdict: question.verdict,
        correct_answer: question.correct_answer,
        feedback: question.feedback,
      });
    }

    // Binning it buys nothing: mastery is earned by submitted Sessions only, so
    // the pool is exactly where it was.
    if (method === 'POST' && path.endsWith('/abandon')) {
      if (review.status !== 'in_progress') {
        return json({ detail: 'exam_not_in_progress' }, 409);
      }
      review.status = 'abandoned';
      return json({ ...review, pending });
    }

    if (method === 'POST' && path.endsWith('/finish')) {
      if (review.status !== 'in_progress') {
        return json({ detail: 'exam_not_in_progress' }, 409);
      }
      const marked = review.questions.filter((one) => one.verdict !== null);
      review.status = 'submitted';
      review.max_score = marked.length;
      review.score = marked.filter((one) => one.verdict === 'correct').length;
      review.score_pct = marked.length
        ? Math.round((review.score / marked.length) * 1000) / 10
        : null;
      review.submitted_at = new Date().toISOString();
      review.duration_seconds = 68;
      for (const one of review.questions) {
        one.correct_answer = REVIEW_CORRECT[one.question_id];
      }
      // Submitting is what makes the correct answers count. The mock stands in
      // for three sessions' worth of history by mastering each one outright,
      // which is all any screen can tell the difference of.
      pending = Math.max(0, pending - review.score);
      review.pending = pending;
      return json(review);
    }

    return json({ ...review, pending });
  });

  await page.route('**/session/stats', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(statsData) })
  );

  await page.route('**/session', (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 1 }), status: 201 });
    } else {
      route.fallback();
    }
  });
}
