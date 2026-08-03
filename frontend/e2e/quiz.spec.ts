import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';
import {
  QUIZ_MULTIPLE_CHOICE,
  QUIZ_OPEN,
  QUIZ_TRUE_FALSE,
} from './fixtures/quizQuestions';

// Promossi o Cirrotici is mobile-first, so the whole spec runs at a phone
// viewport with touch. That is the point: it is the only place the constraint
// becomes verifiable rather than declared.
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

test('a student reaches the game from Home and is shown a question', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en');

  await page.getByTestId('quiz-game-card').click();

  await page.waitForURL('**/quiz');
  await page.getByTestId('quiz-question').waitFor();
  await expect(page.getByTestId('quiz-question-text')).toHaveText(QUIZ_MULTIPLE_CHOICE.text);
});

test('the game card carries the localized title on each locale', async ({ page }) => {
  await mockApi(page);

  await page.goto('/en');
  await expect(page.getByTestId('quiz-game-card')).toContainText('Graduated or Decanted?');

  await page.goto('/it');
  await expect(page.getByTestId('quiz-game-card')).toContainText(
    'Promossi o Cirrotici: Il Gioco Finale'
  );
});

test('the URL slug stays /quiz on the Italian locale', async ({ page }) => {
  await mockApi(page);
  await page.goto('/it');

  await page.getByTestId('quiz-game-card').click();

  await page.waitForURL('**/it/quiz');
  await page.getByTestId('quiz-question').waitFor();
});

test('a multiple-choice question is answerable with one thumb tap', async ({ page }) => {
  await mockApi(page, { quizQuestions: [QUIZ_MULTIPLE_CHOICE] });
  await page.goto('/en/quiz');

  const options = page.getByTestId('quiz-option');
  await expect(options).toHaveCount(QUIZ_MULTIPLE_CHOICE.options.length);

  const first = options.first();
  // a tap target comfortable on a phone
  const box = await first.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await first.tap();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
});

test('a true/false question offers two choices and an open one a text box', async ({ page }) => {
  await mockApi(page, { quizQuestions: [QUIZ_TRUE_FALSE, QUIZ_OPEN] });
  await page.goto('/en/quiz');

  await expect(page.getByTestId('quiz-option')).toHaveCount(2);
  await expect(page.getByTestId('quiz-format')).toHaveText('True or false');

  await page.getByTestId('quiz-another').click();

  await expect(page.getByTestId('quiz-open-answer')).toBeVisible();
  await expect(page.getByTestId('quiz-question-text')).toHaveText(QUIZ_OPEN.text);
});

test('drawing another question replaces the one on screen', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en/quiz');

  await expect(page.getByTestId('quiz-question-text')).toHaveText(QUIZ_MULTIPLE_CHOICE.text);
  await page.getByTestId('quiz-another').click();
  await expect(page.getByTestId('quiz-question-text')).toHaveText(QUIZ_TRUE_FALSE.text);
});

test('the question fits the phone viewport without sideways scrolling', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en/quiz');
  await page.getByTestId('quiz-question').waitFor();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  expect(overflows).toBe(false);
});

test('an empty bank says so instead of showing a blank screen', async ({ page }) => {
  await mockApi(page, { quizQuestions: [] });
  await page.goto('/en/quiz');

  await expect(page.getByTestId('quiz-empty')).toBeVisible();
  await expect(page.getByTestId('quiz-question')).toHaveCount(0);
});
