import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';
import { answerCurrent, sitExam, startExam } from './helpers/exam';
import {
  CORRECT_OPTION,
  EXAM_ID,
  EXAM_LENGTH,
  OPEN_COUNT,
  OPEN_FEEDBACK,
  examInProgress,
} from './fixtures/exam';

// Sitting an Exam on a phone, one thumb, from Home to the verdict. Running at
// a mobile viewport is the point of this file.
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

test('a student sits an exam through to a passing verdict', async ({ page }) => {
  await mockApi(page);
  await startExam(page);

  await expect(page.getByTestId('exam-progress')).toHaveText(`1 of ${EXAM_LENGTH}`);

  await sitExam(page, 24);

  await expect(page.getByTestId('exam-review')).toBeVisible();
  await expect(page.getByTestId('exam-blanks')).toContainText('Every question answered');

  await page.getByTestId('exam-submit').tap();

  await page.waitForURL(`**/quiz/exam/${EXAM_ID}/result`);
  await expect(page.getByTestId('exam-verdict')).toHaveText('Passed');
  await expect(page.getByTestId('exam-score-pct')).toHaveText('80%');
  await expect(page.getByTestId('exam-score')).toContainText(`24 out of ${EXAM_LENGTH}`);
});

test('a paper below the pass mark comes back failed, with the answers it got wrong', async ({
  page,
}) => {
  await mockApi(page);
  await startExam(page);

  await sitExam(page, 17);
  await page.getByTestId('exam-submit').tap();

  await page.waitForURL(`**/quiz/exam/${EXAM_ID}/result`);
  await expect(page.getByTestId('exam-verdict')).toHaveText('Failed');
  await expect(page.getByTestId('exam-result')).toHaveAttribute('data-passed', 'false');
  // every wrong answer comes back with the correct one
  await expect(page.getByTestId('exam-answer-wrong')).toHaveCount(EXAM_LENGTH - 17);
  await expect(page.getByTestId('exam-correct-answer').first()).toBeVisible();
});

test('the progress indicator and the clock follow the student through the paper', async ({
  page,
}) => {
  await mockApi(page);
  await startExam(page);

  await expect(page.getByTestId('exam-elapsed')).toContainText('Elapsed');

  await page.getByTestId('exam-next').tap();
  await expect(page.getByTestId('exam-progress')).toHaveText(`2 of ${EXAM_LENGTH}`);
  await page.getByTestId('exam-next').tap();
  await expect(page.getByTestId('exam-progress')).toHaveText(`3 of ${EXAM_LENGTH}`);
});

test('a student can go back and change an answer already given', async ({ page }) => {
  await mockApi(page);
  await startExam(page);

  const options = page.getByTestId('exam-option');
  await options.first().tap();
  await expect(options.first()).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('exam-next').tap();
  await expect(page.getByTestId('exam-progress')).toHaveText(`2 of ${EXAM_LENGTH}`);

  await page.getByTestId('exam-back').tap();
  await expect(page.getByTestId('exam-progress')).toHaveText(`1 of ${EXAM_LENGTH}`);
  await expect(page.getByTestId('exam-option').first()).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('exam-option').nth(1).tap();
  await expect(page.getByTestId('exam-option').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('exam-option').first()).toHaveAttribute('aria-pressed', 'false');
});

test('a skipped question is flagged on the review screen and can be jumped back to', async ({
  page,
}) => {
  await mockApi(page);
  await startExam(page);

  // skip the first, answer the rest
  await page.getByTestId('exam-next').tap();
  for (let position = 1; position < EXAM_LENGTH; position += 1) {
    await answerCurrent(page, true);
    await page.getByTestId('exam-next').tap();
  }

  await expect(page.getByTestId('exam-review')).toBeVisible();
  await expect(page.getByTestId('exam-review-blank')).toHaveCount(1);
  await expect(page.getByTestId('exam-blanks')).toContainText('1 question left blank');

  await page.getByTestId('exam-review-blank').tap();

  await expect(page.getByTestId('exam-progress')).toHaveText(`1 of ${EXAM_LENGTH}`);
});

test('the primary control reads Skip until the question is answered', async ({ page }) => {
  await mockApi(page);
  await startExam(page);

  await expect(page.getByTestId('exam-next')).toHaveText('Skip');
  await page.getByTestId('exam-option').first().tap();
  await expect(page.getByTestId('exam-next')).toHaveText('Next');
});

test('handing in with blanks warns first, and submitting stays possible', async ({ page }) => {
  await mockApi(page);
  await startExam(page);

  for (let position = 0; position < EXAM_LENGTH; position += 1) {
    await page.getByTestId('exam-next').tap();
  }

  await expect(page.getByTestId('exam-review-blank')).toHaveCount(EXAM_LENGTH);
  await page.getByTestId('exam-submit').tap();

  await expect(page.getByTestId('exam-blanks-warning')).toBeVisible();
  await expect(page.getByTestId('exam-blanks-warning')).toContainText(`${EXAM_LENGTH} questions`);

  // the warning is a choice, not a wall
  await page.getByTestId('exam-cancel-submit').tap();
  await expect(page.getByTestId('exam-blanks-warning')).toHaveCount(0);

  await page.getByTestId('exam-submit').tap();
  await page.getByTestId('exam-submit-anyway').tap();

  await page.waitForURL(`**/quiz/exam/${EXAM_ID}/result`);
  await expect(page.getByTestId('exam-score-pct')).toHaveText('0%');
  await expect(page.getByTestId('exam-verdict')).toHaveText('Failed');
});

test('a student can hand in from anywhere on the paper, not only the last question', async ({
  page,
}) => {
  await mockApi(page);
  await startExam(page);

  await answerCurrent(page, true);
  await page.getByTestId('exam-next').tap();
  await answerCurrent(page, true);

  // question 2 of 30 — nobody should have to tap Next twenty-eight more times
  await page.getByTestId('exam-to-review').tap();

  await expect(page.getByTestId('exam-review')).toBeVisible();
  await page.getByTestId('exam-submit').tap();
  await page.getByTestId('exam-submit-anyway').tap();

  await page.waitForURL(`**/quiz/exam/${EXAM_ID}/result`);
  await expect(page.getByTestId('exam-score')).toContainText(`2 out of ${EXAM_LENGTH}`);
});

test('an interrupted exam is still there, with the answers already given', async ({ page }) => {
  const started = examInProgress();
  started.questions[0].answer = CORRECT_OPTION[started.questions[0].question_id];
  await mockApi(page, { exam: started });

  await page.goto(`/en/quiz/exam/${EXAM_ID}`);

  await page.getByTestId('exam-question').waitFor();
  const chosen = page.getByTestId('exam-option').filter({ hasNotText: 'sbagliata' });
  await expect(chosen.first()).toHaveAttribute('aria-pressed', 'true');
});

test('no correct answer is anywhere in the page while the paper is open', async ({ page }) => {
  await mockApi(page);
  await startExam(page);

  // The right option is on screen — it is one of three — but nothing marks it
  // as right, and the exam carries no verdict until it is handed in.
  const html = await page.content();
  expect(html).not.toContain('correct_answer');
  expect(html).not.toContain('"verdict"');
  await expect(page.getByTestId('exam-correct-answer')).toHaveCount(0);
});

test('the exam screen fits the phone viewport without sideways scrolling', async ({ page }) => {
  await mockApi(page);
  await startExam(page);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  expect(overflows).toBe(false);

  // every control is a comfortable tap target
  for (const testId of ['exam-option', 'exam-next', 'exam-back']) {
    const box = await page.getByTestId(testId).first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test('the result screen fits the phone viewport too', async ({ page }) => {
  await mockApi(page);
  await startExam(page);
  await sitExam(page, 30);
  await page.getByTestId('exam-submit').tap();
  await page.waitForURL(`**/quiz/exam/${EXAM_ID}/result`);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  expect(overflows).toBe(false);

  const box = await page.getByTestId('exam-again').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('an exam that is not the student’s own is not shown', async ({ page }) => {
  await mockApi(page);

  await page.goto('/en/quiz/exam/9999');

  await expect(page.getByTestId('exam-not-found')).toBeVisible();
});

// ── The written answers ──────────────────────────────────────────────────────

test('a written answer is typed, kept, and still there on the way back', async ({ page }) => {
  await mockApi(page);
  await startExam(page);

  // The Open Questions sit after the closed ones on the fixture paper.
  await page.getByTestId('exam-to-review').tap();
  await page.getByTestId('exam-review-blank').nth(EXAM_LENGTH - OPEN_COUNT).tap();

  const written = page.getByTestId('exam-open-answer');
  await expect(written).toBeVisible();
  await expect(page.getByTestId('exam-option')).toHaveCount(0);
  await written.fill('Il tannino viene dalle bucce, dai vinaccioli e dal legno.');

  await page.getByTestId('exam-next').tap();
  await expect(page.getByTestId('exam-open-answer')).toHaveValue('');
  await page.getByTestId('exam-back').tap();

  await expect(page.getByTestId('exam-open-answer')).toHaveValue(
    'Il tannino viene dalle bucce, dai vinaccioli e dal legno.'
  );
});

test('the recap shows the closed questions while the written ones are still being graded', async ({
  page,
}) => {
  await mockApi(page, { grader: 'down' });
  await startExam(page);

  await sitExam(page, EXAM_LENGTH);
  await page.getByTestId('exam-submit').tap();
  await page.waitForURL(`**/quiz/exam/${EXAM_ID}/result`);

  // Every closed question is already marked and on screen…
  await expect(page.getByTestId('exam-answer-correct')).toHaveCount(EXAM_LENGTH - OPEN_COUNT);
  // …while the written ones say what they are waiting for.
  await expect(page.getByTestId('exam-answer-grading')).toHaveCount(OPEN_COUNT);
  // …and no score is invented in the meantime.
  await expect(page.getByTestId('exam-score-pct')).toHaveCount(0);
  await expect(page.getByTestId('exam-verdict')).toHaveCount(0);
});

test('a grading agent that gives up leaves the paper ungraded, and asking again finishes it', async ({
  page,
}) => {
  await mockApi(page, { grader: 'downOnce' });
  await startExam(page);

  await sitExam(page, EXAM_LENGTH);
  await page.getByTestId('exam-submit').tap();
  await page.waitForURL(`**/quiz/exam/${EXAM_ID}/result`);

  await expect(page.getByTestId('exam-grading')).toHaveAttribute('data-failed', 'true');
  await expect(page.getByTestId('exam-score-pct')).toHaveCount(0);

  await page.getByTestId('exam-grading-retry').tap();

  await expect(page.getByTestId('exam-verdict')).toHaveText('Passed');
  await expect(page.getByTestId('exam-score')).toContainText(`${EXAM_LENGTH} out of ${EXAM_LENGTH}`);
});

test('a written answer that was not accepted comes back with the answer and what was missing', async ({
  page,
}) => {
  await mockApi(page);
  await startExam(page);

  await sitExam(page, EXAM_LENGTH - OPEN_COUNT); // every closed one right, every written one wrong
  await page.getByTestId('exam-submit').tap();
  await page.waitForURL(`**/quiz/exam/${EXAM_ID}/result`);

  await expect(page.getByTestId('exam-answer-wrong')).toHaveCount(OPEN_COUNT);
  const wrong = page.getByTestId('exam-answer-wrong').first();
  await expect(wrong.getByTestId('exam-correct-answer')).toBeVisible();
  await expect(wrong.getByTestId('exam-answer-feedback')).toHaveText(OPEN_FEEDBACK);
});

test('a wrong closed question shows the answer and nothing more', async ({ page }) => {
  await mockApi(page);
  await startExam(page);

  await sitExam(page, 0);
  await page.getByTestId('exam-submit').tap();
  await page.waitForURL(`**/quiz/exam/${EXAM_ID}/result`);
  await expect(page.getByTestId('exam-verdict')).toBeVisible();

  // The first question of the paper is closed: it gets the correct answer and
  // no note at all — the bank's explanations stay unused (#16).
  const closed = page.getByTestId('exam-answer-wrong').first();
  await expect(closed.getByTestId('exam-correct-answer')).toBeVisible();
  await expect(closed.getByTestId('exam-answer-feedback')).toHaveCount(0);
});
