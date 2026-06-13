import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';
import { dragToRegion } from './helpers/drag';
import { DENOMINATIONS } from './fixtures/denominations';
import { HINT_RESPONSE } from './fixtures/aiResponses';

// Uses a 1-card fixture (Barolo → piedmont) to keep the test focused.
const ONE_CARD = [DENOMINATIONS[0]]; // Barolo → Piemonte

test('wrong drop triggers hint from AI', async ({ page }) => {
  await mockApi(page, { denominations: ONE_CARD });
  await page.goto('/en/wine-map');

  await page.getByTestId('start-button').click();
  await page.getByTestId('active-card').waitFor();

  // Drop Barolo on Tuscany (wrong region) instead of Piemonte
  await dragToRegion(page, 'tuscany');

  // Hint text from the mocked /hint endpoint should appear
  const hint = page.getByTestId('hint-text');
  await hint.waitFor({ timeout: 5000 });
  await expect(hint).toContainText(HINT_RESPONSE.hint);
});
