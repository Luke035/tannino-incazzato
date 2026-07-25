import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';

test('language toggle switches UI between English and Italian', async ({ page }) => {
  await mockApi(page);

  // English locale — start button reads "Pour & play →"
  await page.goto('/en/wine-map');
  await expect(page.getByTestId('start-button')).toContainText('Pour & play');

  // Italian locale — start button reads "Versa e gioca →"
  await page.goto('/it/wine-map');
  await expect(page.getByTestId('start-button')).toContainText('Versa e gioca');
});
