import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';

test('language toggle switches UI between English and Italian', async ({ page }) => {
  await mockApi(page);

  // English locale — start button reads "Start Session"
  await page.goto('/en');
  await expect(page.getByTestId('start-button')).toHaveText('Start Session');

  // Italian locale — start button reads "Inizia Sessione"
  await page.goto('/it');
  await expect(page.getByTestId('start-button')).toHaveText('Inizia Sessione');
});
