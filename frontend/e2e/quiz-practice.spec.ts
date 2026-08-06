import { test, expect, Page } from '@playwright/test';
import { mockApi } from './helpers/mockApi';
import {
  PRACTICE_CORRECT,
  PRACTICE_FEEDBACK_WRONG,
  PRACTICE_ID,
  PRACTICE_LENGTH,
  practiceInProgress,
} from './fixtures/practice';

// Promossi o Cirrotici is mobile-first, so the whole spec runs at a phone
// viewport with touch. Practice is the mode a student plays standing on a bus,
// which makes this the one place the constraint is verifiable rather than
// declared.
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

/** The question on screen, identified from what it says. The fixtures number
 *  their text in the order they are served, and their ids run alongside. */
async function currentQuestionId(page: Page): Promise<number> {
  const text = await page.getByTestId('exam-question-text').innerText();
  return 200 + Number(text.replace(/\D+/g, '')) - 1;
}

/** Answer the question on screen and wait for the correction. Everything is
 *  read off the screen, exactly as a player reads it. */
async function answerCurrent(page: Page, right: boolean): Promise<void> {
  const questionId = await currentQuestionId(page);
  const correct = PRACTICE_CORRECT[questionId];

  const written = page.getByTestId('exam-open-answer');
  if (await written.count()) {
    await written.fill(right ? correct : 'boh, il tannino, direi');
    await page.getByTestId('practice-check').tap();
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
  await page.getByTestId('practice-next').waitFor();
}

/** From the landing screen to the first question of a fresh Session. */
async function startPractice(page: Page): Promise<void> {
  await page.goto('/en/quiz/practice');
  await page.getByTestId('practice-start').tap();
  await page.waitForURL(`**/quiz/practice/${PRACTICE_ID}`);
  await page.getByTestId('exam-question').waitFor();
}

test('a student reaches Practice from the game landing screen', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en/quiz');

  await page.getByTestId('practice-open').tap();

  await page.waitForURL('**/quiz/practice');
  await expect(page.getByTestId('practice-setup')).toBeVisible();
  await expect(page.getByTestId('practice-start')).toBeVisible();
});

test('the level and the length are chosen before anything is drawn', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en/quiz/practice');

  const levels = page.getByTestId('practice-level');
  const lengths = page.getByTestId('practice-length');
  await expect(levels).toHaveCount(3);
  await expect(lengths).toHaveCount(3);

  await levels.filter({ hasText: 'Level 3' }).tap();
  await lengths.filter({ hasText: '20' }).tap();

  await expect(levels.filter({ hasText: 'Level 3' })).toHaveAttribute('aria-pressed', 'true');
  await expect(lengths.filter({ hasText: '20' })).toHaveAttribute('aria-pressed', 'true');
  // How much of it is typing is said before the student commits to it.
  await expect(page.getByTestId('practice-length-note')).toContainText('10');
});

test('the chosen level is the one the questions come from', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en/quiz/practice');

  await page.getByTestId('practice-level').filter({ hasText: 'Level 3' }).tap();
  await page.getByTestId('practice-start').tap();

  await page.waitForURL(`**/quiz/practice/${PRACTICE_ID}`);
  await expect(page.getByTestId('exam-question-level')).toContainText('Level 3');
});

test('the correction lands immediately after a closed answer', async ({ page }) => {
  await mockApi(page);
  await startPractice(page);

  const options = page.getByTestId('exam-option');
  const questionId = await currentQuestionId(page);
  const wrong = options.filter({ hasNotText: PRACTICE_CORRECT[questionId] }).first();
  await wrong.tap();

  // The whole reason this mode exists: told straight away, and told what the
  // answer actually was.
  await expect(page.getByTestId('practice-wrong')).toBeVisible();
  await expect(page.getByTestId('practice-correct-answer')).toContainText(
    PRACTICE_CORRECT[questionId]
  );
  // …and never a pass or a fail.
  await expect(page.getByTestId('exam-verdict')).toHaveCount(0);
});

test('a right answer is told apart from a wrong one', async ({ page }) => {
  await mockApi(page);
  await startPractice(page);

  await answerCurrent(page, true);

  await expect(page.getByTestId('practice-correct')).toBeVisible();
  // Nothing to correct, so the right answer is not repeated back.
  await expect(page.getByTestId('practice-correct-answer')).toHaveCount(0);
});

test('a written answer comes back with the tannin reading it', async ({ page }) => {
  await mockApi(page, { practice: practiceInProgress(5) });
  await page.goto(`/en/quiz/practice/${PRACTICE_ID}`);

  // Resumed straight onto the first question still unanswered, which in this
  // fixture is a written one.
  await expect(page.getByTestId('exam-open-answer')).toBeVisible();
  await page.getByTestId('exam-open-answer').fill('boh, il tannino, direi');
  await page.getByTestId('practice-check').tap();

  await expect(page.getByTestId('practice-wrong')).toBeVisible();
  await expect(page.getByTestId('practice-feedback')).toContainText(PRACTICE_FEEDBACK_WRONG);
});

test('a question already marked cannot be answered again', async ({ page }) => {
  await mockApi(page);
  await startPractice(page);

  await answerCurrent(page, false);

  // Being shown the right answer and then being allowed to change yours is not
  // studying, so every option on a marked question is closed.
  const options = page.getByTestId('exam-option');
  for (let i = 0; i < (await options.count()); i += 1) {
    await expect(options.nth(i)).toBeDisabled();
  }
  // And the right one is marked as such, so the correction is on the question
  // itself and not only in the panel below it.
  await expect(page.locator('[data-marked="correct"]')).toHaveCount(1);
  await expect(page.locator('[data-marked="wrong"]')).toHaveCount(1);
});

test('a session runs to the end and reports a count, never a verdict', async ({ page }) => {
  await mockApi(page);
  await startPractice(page);

  for (let position = 0; position < PRACTICE_LENGTH; position += 1) {
    await answerCurrent(page, position < 7);
    await page.getByTestId('practice-next').tap();
  }

  await page.waitForURL(`**/quiz/practice/${PRACTICE_ID}/result`);
  await expect(page.getByTestId('practice-score')).toContainText('7 of 10 right');
  await expect(page.getByTestId('practice-score-pct')).toContainText('70');
  // No pass, no fail, at any point.
  await expect(page.getByTestId('exam-verdict')).toHaveCount(0);
  await expect(page.getByText('Passed', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Failed', { exact: true })).toHaveCount(0);
});

test('a session ended early is counted on what was actually answered', async ({ page }) => {
  await mockApi(page);
  await startPractice(page);

  await answerCurrent(page, true);
  await page.getByTestId('practice-next').tap();
  await answerCurrent(page, true);

  await page.getByTestId('practice-end').tap();
  await expect(page.getByTestId('practice-end-warning')).toBeVisible();
  await page.getByTestId('practice-end-confirm').tap();

  await page.waitForURL(`**/quiz/practice/${PRACTICE_ID}/result`);
  await expect(page.getByTestId('practice-score')).toContainText('2 of 2 right');
});

test('an interrupted session is waiting on the landing screen', async ({ page }) => {
  await mockApi(page, { practice: practiceInProgress(3) });
  await page.goto('/en/quiz');

  await expect(page.getByTestId('exam-in-progress')).toBeVisible();
  await expect(page.getByTestId('exam-in-progress-answered')).toContainText('3 of 10');

  await page.getByTestId('exam-resume').tap();

  // Back on the fourth question — the place the interruption cost, and nothing
  // more than that.
  await page.waitForURL(`**/quiz/practice/${PRACTICE_ID}`);
  await expect(page.getByTestId('practice-progress')).toContainText('4 of 10');
});

test('a practice session in progress refuses a new exam rather than replacing it', async ({
  page,
}) => {
  await mockApi(page, { practice: practiceInProgress(2) });
  await page.goto('/en/quiz');

  // One Session across every mode: the way past this screen is to pick the
  // open one up or to bin it on purpose.
  await expect(page.getByTestId('exam-start')).toHaveCount(0);
  await expect(page.getByTestId('exam-in-progress')).toBeVisible();
});

test('an interrupted session can be binned deliberately', async ({ page }) => {
  await mockApi(page, { practice: practiceInProgress(3) });
  await page.goto('/en/quiz');

  await page.getByTestId('exam-abandon').tap();
  await expect(page.getByTestId('exam-abandon-warning')).toBeVisible();
  await page.getByTestId('exam-abandon-confirm').tap();

  await expect(page.getByTestId('exam-in-progress')).toHaveCount(0);
  await expect(page.getByTestId('exam-start')).toBeVisible();
});

test('an answer the tannin could not read is not turned into a wrong one', async ({ page }) => {
  await mockApi(page, { practice: practiceInProgress(5), practiceGrader: 'downOnce' });
  await page.goto(`/en/quiz/practice/${PRACTICE_ID}`);

  await page.getByTestId('exam-open-answer').fill('una risposta che vale');
  await page.getByTestId('practice-check').tap();

  await expect(page.getByTestId('practice-stalled')).toBeVisible();
  await expect(page.getByTestId('practice-wrong')).toHaveCount(0);

  // Asking again is the whole recovery, and the answer is still there.
  await page.getByTestId('practice-retry').tap();
  await expect(page.getByTestId('practice-stalled')).toHaveCount(0);
  await expect(page.getByTestId('practice-wrong')).toBeVisible();
});

test('a level too thin to fill the session says so instead of failing silently', async ({
  page,
}) => {
  await mockApi(page, { practiceRefused: true });
  await page.goto('/en/quiz/practice');

  await page.getByTestId('practice-start').tap();

  await expect(page.getByTestId('practice-thin')).toBeVisible();
  await expect(page).toHaveURL(/\/en\/quiz\/practice$/);
});

test('every practice screen fits the phone viewport without sideways scrolling', async ({
  page,
}) => {
  await mockApi(page);
  const overflows = () =>
    page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  await page.goto('/en/quiz/practice');
  await page.getByTestId('practice-start').waitFor();
  expect(await overflows()).toBe(false);

  await page.getByTestId('practice-start').tap();
  await page.getByTestId('exam-question').waitFor();
  expect(await overflows()).toBe(false);

  await answerCurrent(page, false);
  expect(await overflows()).toBe(false);
});
