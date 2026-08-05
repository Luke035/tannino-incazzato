import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';

// Promossi o Cirrotici is mobile-first, so the whole spec runs at a phone
// viewport with touch. That is the point: it is the only place the constraint
// becomes verifiable rather than declared.
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

test('a student reaches the game from Home', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en');

  await page.getByTestId('quiz-game-card').click();

  await page.waitForURL('**/quiz');
  await expect(page.getByTestId('exam-start')).toBeVisible();
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
  await expect(page.getByTestId('exam-start')).toBeVisible();
});

test('the landing page fits the phone viewport without sideways scrolling', async ({ page }) => {
  await mockApi(page);
  await page.goto('/en/quiz');
  await page.getByTestId('exam-start').waitFor();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  expect(overflows).toBe(false);
});

test('a bank too thin to fill a paper says so instead of failing silently', async ({ page }) => {
  await mockApi(page, { examRefused: true });
  await page.goto('/en/quiz');

  await page.getByTestId('exam-start').tap();

  await expect(page.getByTestId('quiz-empty')).toBeVisible();
  await expect(page).toHaveURL(/\/en\/quiz$/);
});
