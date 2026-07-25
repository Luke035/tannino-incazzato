import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';
import { dragToRegion } from './helpers/drag';
import { DENOMINATIONS } from './fixtures/denominations';
import { MEMORIZE_TIP_RESPONSE } from './fixtures/aiResponses';

const ONE_CARD = [DENOMINATIONS[0]]; // Barolo → Piemonte

test('3 wrong drops show AutoPlaceModal with memorize tip', async ({ page }) => {
  await mockApi(page, { denominations: ONE_CARD });
  await page.goto('/en/wine-map');

  await page.getByTestId('start-button').click();
  await page.getByTestId('active-card').waitFor();

  // Three wrong drops — each time drop on Tuscany instead of Piemonte
  for (let i = 0; i < 3; i++) {
    await dragToRegion(page, 'tuscany');
    await page.waitForTimeout(300);
  }

  // Modal should appear after the 3rd wrong drop
  const modal = page.getByTestId('auto-place-modal');
  await modal.waitFor({ timeout: 5000 });

  // Memorize tip from the mocked /memorize endpoint should be visible
  const tip = page.getByTestId('memorize-tip');
  await tip.waitFor({ timeout: 5000 });
  await expect(tip).toContainText(MEMORIZE_TIP_RESPONSE.tip);

  // Clicking "Got it, continue" dismisses the modal
  await page.getByText('Got it, continue').click();
  await expect(modal).not.toBeVisible();
});
