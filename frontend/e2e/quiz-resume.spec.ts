import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';
import { answerCurrent, startExam } from './helpers/exam';
import { CORRECT_OPTION, EXAM_ID, EXAM_LENGTH, examInProgress } from './fixtures/exam';

// Being interrupted is a phone thing, so the whole file runs at a phone
// viewport with touch: the student who walks away mid-paper is standing on a
// bus, not sitting at a desk.
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

test('an interrupted exam is waiting on the landing screen with how far it got', async ({
  page,
}) => {
  const started = examInProgress();
  started.questions[0].answer = CORRECT_OPTION[started.questions[0].question_id];
  started.questions[1].answer = CORRECT_OPTION[started.questions[1].question_id];
  await mockApi(page, { exam: started });

  await page.goto('/en/quiz');

  await expect(page.getByTestId('exam-in-progress')).toBeVisible();
  await expect(page.getByTestId('exam-in-progress-answered')).toContainText(
    `2 of ${EXAM_LENGTH}`
  );
});

test('a paper left mid-question is picked up with its answers intact', async ({ page }) => {
  await mockApi(page);
  await startExam(page);

  const first = await answerCurrent(page, true);
  await page.getByTestId('exam-next').tap();
  const second = await answerCurrent(page, true);

  // The phone call: the student leaves the paper without handing anything in.
  await page.goto('/en/quiz');

  await expect(page.getByTestId('exam-in-progress-answered')).toContainText(
    `2 of ${EXAM_LENGTH}`
  );
  await page.getByTestId('exam-resume').tap();
  await page.waitForURL(`**/quiz/exam/${EXAM_ID}`);
  await page.getByTestId('exam-question').waitFor();

  // Both answers are still on the paper, and the options are in the order they
  // were served rather than reshuffled underneath them.
  await expect(page.getByTestId('exam-option').filter({ hasText: first })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByTestId('exam-next').tap();
  await expect(page.getByTestId('exam-option').filter({ hasText: second })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('a written answer typed and then walked away from is still there', async ({ page }) => {
  await mockApi(page);
  await startExam(page);

  // Question 17 is the first Open one: written answers are the format whose
  // write is held back until the typing stops, so they are the one that has to
  // be proved to survive an interruption.
  for (let position = 0; position < 16; position += 1) {
    await page.getByTestId('exam-next').tap();
  }
  const written = 'la macerazione carbonica, in atmosfera di anidride carbonica';
  await page.getByTestId('exam-open-answer').fill(written);

  // The phone being locked or the tab being closed — neither runs a React
  // cleanup, so the page's own lifecycle handler is what saves the answer, and
  // it does so without waiting out the delay it would otherwise sit through.
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'PUT'),
    page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide'))),
  ]);

  await page.goto('/en/quiz');

  await expect(page.getByTestId('exam-in-progress-answered')).toContainText(
    `1 of ${EXAM_LENGTH}`
  );
  await page.getByTestId('exam-resume').tap();
  await page.getByTestId('exam-question').waitFor();
  for (let position = 0; position < 16; position += 1) {
    await page.getByTestId('exam-next').tap();
  }

  await expect(page.getByTestId('exam-open-answer')).toHaveValue(written);
});

test('a new paper is not on offer while one is open', async ({ page }) => {
  await mockApi(page, { exam: examInProgress() });

  await page.goto('/en/quiz');

  await expect(page.getByTestId('exam-in-progress')).toBeVisible();
  await expect(page.getByTestId('exam-start')).toHaveCount(0);
  // The two ways out of the screen, and only those two.
  await expect(page.getByTestId('exam-resume')).toBeVisible();
  await expect(page.getByTestId('exam-abandon')).toBeVisible();
});

test('binning a paper is confirmed first, and backing out keeps it', async ({ page }) => {
  await mockApi(page, { exam: examInProgress() });
  await page.goto('/en/quiz');

  await page.getByTestId('exam-abandon').tap();

  await expect(page.getByTestId('exam-abandon-warning')).toBeVisible();
  await page.getByTestId('exam-abandon-cancel').tap();

  await expect(page.getByTestId('exam-abandon-warning')).toHaveCount(0);
  await expect(page.getByTestId('exam-in-progress')).toBeVisible();
});

test('binning a paper on purpose frees the slot for a new one', async ({ page }) => {
  await mockApi(page, { exam: examInProgress() });
  await page.goto('/en/quiz');

  await page.getByTestId('exam-abandon').tap();
  await page.getByTestId('exam-abandon-confirm').tap();

  await expect(page.getByTestId('exam-in-progress')).toHaveCount(0);
  await expect(page.getByTestId('exam-start')).toBeVisible();

  await page.getByTestId('exam-start').tap();
  await page.waitForURL(`**/quiz/exam/${EXAM_ID}`);
  await expect(page.getByTestId('exam-question')).toBeVisible();
});

test('a binned paper cannot be sat by going back to its address', async ({ page }) => {
  await mockApi(page, { exam: examInProgress() });
  await page.goto('/en/quiz');
  await page.getByTestId('exam-abandon').tap();
  await page.getByTestId('exam-abandon-confirm').tap();
  await expect(page.getByTestId('exam-start')).toBeVisible();

  await page.goto(`/en/quiz/exam/${EXAM_ID}`);

  await page.waitForURL('**/en/quiz');
  await expect(page.getByTestId('exam-start')).toBeVisible();
});

test('a paper binned in another tab does not leave the student tapping a dead button', async ({
  page,
}) => {
  // The paper is binned elsewhere in the moment between handing in and the
  // request landing, so the submission is refused.
  await mockApi(page, { exam: examInProgress(), abandonedElsewhere: true });
  await page.goto(`/en/quiz/exam/${EXAM_ID}`);
  await page.getByTestId('exam-question').waitFor();

  await page.getByTestId('exam-to-review').tap();
  await page.getByTestId('exam-submit').tap();
  await page.getByTestId('exam-submit-anyway').tap();

  await page.waitForURL('**/en/quiz');
  await expect(page.getByTestId('exam-start')).toBeVisible();
});

test('a backend that cannot be reached does not get blamed on the bank', async ({ page }) => {
  await mockApi(page, { examBroken: true });
  await page.goto('/en/quiz');

  await page.getByTestId('exam-start').tap();

  await expect(page.getByTestId('quiz-unavailable')).toBeVisible();
  await expect(page.getByTestId('quiz-empty')).toHaveCount(0);
});
