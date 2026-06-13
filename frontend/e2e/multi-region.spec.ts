import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';
import { dragToRegion } from './helpers/drag';
import { DENOMINATIONS } from './fixtures/denominations';

// Prosecco spans Veneto + Friuli Venezia Giulia — the card must stay active
// after placing the first region and only complete after both are placed.
const PROSECCO = [DENOMINATIONS[8]]; // { name: 'Prosecco', regions: ['Veneto', 'Friuli Venezia Giulia'] }

test('multi-region card stays active until all regions are placed', async ({ page }) => {
  await mockApi(page, { denominations: PROSECCO });
  await page.goto('/en/wine-map');

  await page.getByTestId('start-button').click();
  await page.getByTestId('active-card').waitFor();

  // Place first region (Veneto) — card must stay active
  await dragToRegion(page, 'veneto');
  await page.waitForTimeout(300);

  await expect(page.getByTestId('active-card')).toBeVisible();
  await expect(page.getByTestId('card-name')).toHaveText('Prosecco');

  // Place second region (Friuli) — card completes, game navigates to recap
  await dragToRegion(page, 'friuli-venezia-giulia');

  await page.waitForURL('**/recap**', { timeout: 5000 });
  await page.getByTestId('recap-screen').waitFor();
});
