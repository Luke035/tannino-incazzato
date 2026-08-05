import type { Page } from '@playwright/test';
import { DENOMINATIONS } from '../fixtures/denominations';
import { HINT_RESPONSE, MEMORIZE_TIP_RESPONSE, REVIEW_RESPONSE } from '../fixtures/aiResponses';
import { EMPTY_STATS, ONE_SESSION_STATS } from '../fixtures/sessionStats';
import { CORRECT_OPTION, EXAM_ID, ExamFixture, examInProgress } from '../fixtures/exam';

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
  }
): Promise<void> {
  const denoms = options?.denominations ?? DENOMINATIONS;
  const statsData = options?.statsVariant === 'one-session' ? ONE_SESSION_STATS : EMPTY_STATS;

  // The Exam is a stateful resource, so the mock is a small server rather than
  // a fixed payload: the answers a spec gives have to come back on a refetch,
  // and the score has to follow from them.
  let exam: ExamFixture | null = options?.exam ?? null;

  await page.route(/\/quiz\/exams/, (route) => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ contentType: 'application/json', status, body: JSON.stringify(body) });

    if (method === 'POST' && path.endsWith('/quiz/exams')) {
      if (options?.examRefused) {
        return json({ detail: 'question_bank_too_small' }, 409);
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

    if (method === 'POST' && path.endsWith('/submit')) {
      let score = 0;
      for (const question of exam.questions) {
        const correct = question.answer === CORRECT_OPTION[question.question_id];
        question.verdict = correct ? 'correct' : 'wrong';
        question.correct_answer = CORRECT_OPTION[question.question_id];
        if (correct) score += 1;
      }
      exam.status = 'submitted';
      exam.score = score;
      exam.score_pct = Math.round((score / exam.max_score) * 1000) / 10;
      exam.passed = exam.score_pct >= 60;
      exam.submitted_at = new Date().toISOString();
      exam.duration_seconds = 92;
      return json(exam);
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
