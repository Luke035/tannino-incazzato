import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';
import { dragToRegion } from './helpers/drag';
import { DENOMINATIONS } from './fixtures/denominations';
import { REVIEW_RESPONSE } from './fixtures/aiResponses';

const ONE_CARD = [DENOMINATIONS[0]]; // Barolo → Piemonte

test('recap screen shows AI review after completing session', async ({ page }) => {
  await mockApi(page, { denominations: ONE_CARD });
  await page.goto('/en/wine-map');

  await page.getByTestId('start-button').click();
  await page.getByTestId('active-card').waitFor();

  // Complete the single card correctly
  await dragToRegion(page, 'piedmont');

  await page.waitForURL('**/recap**', { timeout: 5000 });
  await page.getByTestId('recap-screen').waitFor();

  // AI review text from the mocked /review endpoint should appear
  const review = page.getByTestId('ai-review-text');
  await review.waitFor({ timeout: 5000 });
  await expect(review).toContainText(REVIEW_RESPONSE.review);
});
