import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';

// The ticket asks for the quiz profile section checked at a mobile viewport,
// where the two-column stats collapse to one and the section is what a student
// actually reads on their phone the week before the exam.
const MOBILE = { width: 390, height: 844 };

test.use({ viewport: MOBILE });

async function selectQuizGame(page: import('@playwright/test').Page) {
  await page.goto('/en/profile');
  await page.getByRole('button', { name: /Promossi o Cirrotici/ }).click();
}

test('quiz section shows a designed empty state, not a page of zeroes', async ({ page }) => {
  await mockApi(page, { quizStatsVariant: 'empty' });
  await selectQuizGame(page);

  await page.getByTestId('quiz-empty-state').waitFor();
  await expect(page.getByTestId('quiz-empty-state')).toBeVisible();
  await expect(page.getByTestId('quiz-stats')).not.toBeVisible();
});

test('quiz section lists the submitted exam with verdict and score', async ({ page }) => {
  await mockApi(page, { quizStatsVariant: 'one-exam' });
  await selectQuizGame(page);

  await page.getByTestId('quiz-stats').waitFor();
  const rows = page.getByTestId('quiz-exam-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Passed');
  await expect(rows.first()).toContainText('63%');
});

test('quiz section breaks performance down by format, level and topic', async ({ page }) => {
  await mockApi(page, { quizStatsVariant: 'one-exam' });
  await selectQuizGame(page);

  const stats = page.getByTestId('quiz-stats');
  await stats.waitFor();
  // The pattern the ticket names: fine on the Closed questions, collapsing on
  // the written ones.
  await expect(stats).toContainText('Closed questions');
  await expect(stats).toContainText('Written questions');
  // Topic advice is a subject, not a level.
  await expect(stats).toContainText('Sparkling wines');
  // Levels are broken out.
  await expect(stats).toContainText('Level 1');
});

test('quiz section shows how many questions are still waiting to be mastered', async ({ page }) => {
  await mockApi(page, { quizStatsVariant: 'one-exam' });
  await selectQuizGame(page);

  const stats = page.getByTestId('quiz-stats');
  await stats.waitFor();
  await expect(stats).toContainText('12');
});

test('mappa dei vini stats stay separate from the quiz section', async ({ page }) => {
  await mockApi(page, { statsVariant: 'one-session', quizStatsVariant: 'one-exam' });
  await page.goto('/en/profile');

  // Mappa is the default panel and its own stats show first.
  await page.getByTestId('profile-stats').waitFor();
  await expect(page.getByTestId('quiz-stats')).not.toBeVisible();

  // Switching to the quiz swaps the panel — the two are never shown averaged.
  await page.getByRole('button', { name: /Promossi o Cirrotici/ }).click();
  await page.getByTestId('quiz-stats').waitFor();
  await expect(page.getByTestId('profile-stats')).not.toBeVisible();
});
