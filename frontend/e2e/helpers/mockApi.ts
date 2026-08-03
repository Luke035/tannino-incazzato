import type { Page } from '@playwright/test';
import { DENOMINATIONS } from '../fixtures/denominations';
import { HINT_RESPONSE, MEMORIZE_TIP_RESPONSE, REVIEW_RESPONSE } from '../fixtures/aiResponses';
import { EMPTY_STATS, ONE_SESSION_STATS } from '../fixtures/sessionStats';
import { QUIZ_QUESTIONS } from '../fixtures/quizQuestions';

const MOCK_USER = { id: 1, email: 'e2e-test@sommelier.test', first_name: 'Test', last_name: 'User' };

export type StatsVariant = 'empty' | 'one-session';

// Intercepts all backend API calls and returns deterministic fixture data.
// Call this before navigating to any page.
export async function mockApi(
  page: Page,
  options?: {
    denominations?: typeof DENOMINATIONS;
    statsVariant?: StatsVariant;
    // Served in order by successive calls to GET /quiz/question; an empty
    // array makes the bank look dry (404).
    quizQuestions?: typeof QUIZ_QUESTIONS;
  }
): Promise<void> {
  const denoms = options?.denominations ?? DENOMINATIONS;
  const statsData = options?.statsVariant === 'one-session' ? ONE_SESSION_STATS : EMPTY_STATS;
  const quizQuestions = options?.quizQuestions ?? QUIZ_QUESTIONS;

  let quizDraw = 0;
  await page.route('**/quiz/question', (route) => {
    if (quizQuestions.length === 0) {
      route.fulfill({
        contentType: 'application/json',
        status: 404,
        body: JSON.stringify({ detail: 'No questions available' }),
      });
      return;
    }
    const question = quizQuestions[quizDraw % quizQuestions.length];
    quizDraw += 1;
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(question) });
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
