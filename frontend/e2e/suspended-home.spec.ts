import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';

// A suspended player is not thrown out: they still sign in and still reach the
// home screen. But every game there is greyed, non-interactive, and carries an
// explanation that names suspension specifically — distinguishable from a game
// greyed for any other reason (#44).

test('a suspended player sees greyed games with the suspension explanation', async ({ page }) => {
  await mockApi(page, { suspended: true });

  await page.goto('/en/');

  // The player reaches the home screen and reads their games — they are not
  // dropped at a login screen.
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();

  // The live game is greyed: no longer a button, marked suspended and disabled.
  const quiz = page.getByTestId('quiz-game-card');
  await expect(quiz).toHaveAttribute('data-suspended', 'true');
  await expect(quiz).toHaveAttribute('aria-disabled', 'true');

  // The copy names suspension, so it can never be confused with a game merely
  // coming soon or offline for maintenance.
  await expect(quiz).toContainText('Suspended');
  await expect(quiz).toContainText('Your account is suspended');
});

test('an open player still sees a playable game tile', async ({ page }) => {
  await mockApi(page);

  await page.goto('/en/');

  const quiz = page.getByTestId('quiz-game-card');
  // An open player's tile is a real button with the live badge, not greyed.
  await expect(quiz).not.toHaveAttribute('data-suspended', 'true');
  await expect(quiz).toContainText('Available');
});

test('the suspension explanation is translated into Italian', async ({ page }) => {
  await mockApi(page, { suspended: true });

  await page.goto('/it/');

  const quiz = page.getByTestId('quiz-game-card');
  await expect(quiz).toContainText('Sospeso');
  await expect(quiz).toContainText('Il tuo account è sospeso');
});
