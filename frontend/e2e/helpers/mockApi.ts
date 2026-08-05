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
  }
): Promise<void> {
  const denoms = options?.denominations ?? DENOMINATIONS;
  const statsData = options?.statsVariant === 'one-session' ? ONE_SESSION_STATS : EMPTY_STATS;

  // The Exam is a stateful resource, so the mock is a small server rather than
  // a fixed payload: the answers a spec gives have to come back on a refetch,
  // and the score has to follow from them.
  let exam: ExamFixture | null = options?.exam ?? null;
  let gradingRequests = 0;

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

    // The Session in progress, or nothing. Only an in-progress paper holds the
    // slot: a submitted or an abandoned one has already freed it.
    if (method === 'GET' && path.endsWith('/quiz/exams/current')) {
      return json(exam && exam.status === 'in_progress' ? exam : null);
    }

    if (method === 'POST' && path.endsWith('/quiz/exams')) {
      if (options?.examBroken) {
        return json({ detail: 'internal_server_error' }, 500);
      }
      if (options?.examRefused) {
        return json({ detail: 'question_bank_too_small' }, 409);
      }
      // Refused rather than replacing it: one Session in progress at a time,
      // and no tap destroys the paper the player already has open.
      if (exam && exam.status === 'in_progress') {
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

  await page.route('**/review', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(REVIEW_RESPONSE) })
  );

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
