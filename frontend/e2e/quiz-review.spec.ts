import { test, expect, Page } from '@playwright/test';
import { mockApi } from './helpers/mockApi';
import {
  REVIEW_CORRECT,
  REVIEW_ID,
  REVIEW_LENGTH,
  REVIEW_PENDING,
  reviewInProgress,
} from './fixtures/review';

// Mobile-first like the rest of the game: Error Review is the mode a student
// opens for five minutes before a lesson, which makes the phone the real
// viewport rather than the small one.
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

async function currentQuestionId(page: Page): Promise<number> {
  const text = await page.getByTestId('exam-question-text').innerText();
  return 300 + Number(text.replace(/\D+/g, '')) - 1;
}

async function answerCurrent(page: Page, right: boolean): Promise<void> {
  const questionId = await currentQuestionId(page);
  const correct = REVIEW_CORRECT[questionId];

  const written = page.getByTestId('exam-open-answer');
  if (await written.count()) {
    await written.fill(right ? correct : 'boh, il tannino, direi');
    await page.getByTestId('review-check').tap();
  } else {
    const options = page.getByTestId('exam-option');
    for (let i = 0; i < (await options.count()); i += 1) {
      const option = options.nth(i);
      if (right === ((await option.getAttribute('data-option')) === correct)) {
        await option.tap();
        break;
      }
    }
  }
  await page.getByTestId('review-next').waitFor();
}

async function startReview(page: Page): Promise<void> {
  await page.goto('/en/quiz/review');
  await page.getByTestId('review-start').tap();
  await page.waitForURL(`**/quiz/review/${REVIEW_ID}`);
  await page.getByTestId('exam-question').waitFor();
}

test('a student reaches Error Review from the game landing screen', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en/quiz');

  // The count is on the card, before the tap: how much is left is the whole
  // state of this mode, and a student decides on it.
  await expect(page.getByTestId('review-card-pending')).toContainText(String(REVIEW_PENDING));

  await page.getByTestId('review-open').tap();

  await page.waitForURL('**/quiz/review');
  await expect(page.getByTestId('review-setup')).toBeVisible();
});

test('the number still waiting is shown before and during the session', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en/quiz/review');

  await expect(page.getByTestId('review-pool')).toContainText(String(REVIEW_PENDING));

  await page.getByTestId('review-start').tap();
  await page.waitForURL(`**/quiz/review/${REVIEW_ID}`);

  await expect(page.getByTestId('review-pending')).toContainText(String(REVIEW_PENDING));
});

test('there is no level to choose — the pool is the player, not a syllabus', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en/quiz/review');

  await expect(page.getByTestId('review-length')).toHaveCount(3);
  await expect(page.getByTestId('practice-level')).toHaveCount(0);
});

test('the correction lands with the answer, as in Practice', async ({ page }) => {
  await mockApi(page);
  await startReview(page);

  await answerCurrent(page, false);

  await expect(page.getByTestId('review-wrong')).toBeVisible();
  await expect(page.getByTestId('review-correct-answer')).toBeVisible();
  // Nothing here passes or fails anybody, in any of the three modes.
  await expect(page.getByTestId('exam-verdict-badge')).toHaveCount(0);
});

test('an empty pool is a congratulation with somewhere to go, not a blank screen', async ({
  page,
}) => {
  await mockApi(page, { reviewEmpty: true });
  await page.goto('/en/quiz/review');

  const empty = page.getByTestId('review-empty');
  await expect(empty).toBeVisible();
  // Told they have finished something, and then given the two ways to make
  // more of it. "Well done, now what" is not an answer.
  await expect(page.getByTestId('review-empty-practice')).toBeVisible();
  await expect(page.getByTestId('review-empty-exam')).toBeVisible();
  // Nothing to start, so nothing offers to start it.
  await expect(page.getByTestId('review-start')).toHaveCount(0);
});

test('a session already open is resumed rather than replaced', async ({ page }) => {
  await mockApi(page, { review: reviewInProgress(3) });
  await page.goto('/en/quiz');

  await expect(page.getByTestId('exam-in-progress')).toBeVisible();
  await page.getByTestId('exam-resume').tap();

  await page.waitForURL(`**/quiz/review/${REVIEW_ID}`);
  // Back on the first question without a correction, which is the fourth.
  await expect(page.getByTestId('review-progress')).toContainText(`4 of ${REVIEW_LENGTH}`);
});

test('a session ended early is counted on what was actually marked', async ({ page }) => {
  await mockApi(page);
  await startReview(page);

  await answerCurrent(page, true);
  await page.getByTestId('review-next').tap();
  await answerCurrent(page, true);

  await page.getByTestId('review-end').tap();
  await page.getByTestId('review-end-confirm').tap();

  await page.waitForURL(`**/quiz/review/${REVIEW_ID}/result`);
  await expect(page.getByTestId('review-score')).toHaveText('2/2');
  // The pool is two shorter than it was, and the screen says so rather than
  // leaving the student to work it out.
  await expect(page.getByTestId('review-remaining')).toContainText(String(REVIEW_PENDING - 2));
  // No Level badge: an Error Review Session was never drawn from one.
  await expect(page.getByTestId('review-level-badge')).toHaveCount(0);
});

test('nothing on any Error Review screen overflows a phone', async ({ page }) => {
  await mockApi(page);

  for (const url of ['/en/quiz', '/en/quiz/review']) {
    await page.goto(url);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(393);
  }

  await startReview(page);
  await answerCurrent(page, false);
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(393);
});
