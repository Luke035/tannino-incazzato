import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';
import { dragToRegion } from './helpers/drag';
import { DENOM_SVG_REGIONS } from './fixtures/denominations';

// Full happy path: start a session with 10 mocked cards, place every card
// correctly on the first attempt, and verify the recap screen is reached
// with a perfect score.
test('complete game with 10 cards all correct reaches recap with perfect score', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/en/wine-map');

  await page.getByTestId('start-button').click();

  // Wait for the game to load (first card appears)
  await page.getByTestId('active-card').waitFor();

  for (let i = 0; i < 10; i++) {
    const cardName = (await page.getByTestId('card-name').textContent())?.trim();
    expect(cardName).toBeTruthy();

    const svgIds = DENOM_SVG_REGIONS[cardName!];
    expect(svgIds, `Unknown denomination in fixture: "${cardName}"`).toBeTruthy();

    for (const svgId of svgIds) {
      await dragToRegion(page, svgId);
      // Allow React state to settle between drops
      await page.waitForTimeout(300);
    }

    if (i < 9) {
      // Wait for the card name to change to confirm the next card loaded
      await page.waitForFunction(
        (name) => {
          const el = document.querySelector('[data-testid="card-name"]');
          return el !== null && el.textContent?.trim() !== name;
        },
        cardName,
        { timeout: 5000 }
      );
    }
  }

  // After all 10 cards the game auto-navigates to recap
  await page.waitForURL('**/recap**', { timeout: 5000 });
  await page.getByTestId('recap-screen').waitFor();

  // Score should be 30 / 30 (10 cards × 3 points each, zero wrong drops)
  await expect(page.getByTestId('recap-score')).toContainText('30');
});
