import { test, expect } from '@playwright/test';
import { mockApi } from './helpers/mockApi';
import { dragToRegion } from './helpers/drag';
import { DENOM_SVG_REGIONS } from './fixtures/denominations';

test('new user sees empty state with play CTA on profile page', async ({ page }) => {
  await mockApi(page, { statsVariant: 'empty' });
  await page.goto('/en/profile');

  await page.getByTestId('profile-empty-state').waitFor();
  await expect(page.getByTestId('profile-empty-state')).toBeVisible();
  // Stats section should not be visible
  await expect(page.getByTestId('profile-stats')).not.toBeVisible();
});

test('profile shows correct stats when user has sessions', async ({ page }) => {
  await mockApi(page, { statsVariant: 'one-session' });
  await page.goto('/en/profile');

  await page.getByTestId('profile-stats').waitFor();
  // Should show 1 session
  await expect(page.getByTestId('profile-stats')).toContainText('1');
  // Should show avg score 87%
  await expect(page.getByTestId('profile-stats')).toContainText('87%');
  // Should show 10 unique denoms
  await expect(page.getByTestId('profile-stats')).toContainText('10');
});

test('profile shows recent sessions list', async ({ page }) => {
  await mockApi(page, { statsVariant: 'one-session' });
  await page.goto('/en/profile');

  const sessionsList = page.getByTestId('profile-sessions');
  await sessionsList.waitFor();
  const rows = page.getByTestId('session-row');
  await expect(rows).toHaveCount(1);
  // Should show score pill with 87%
  await expect(rows.first()).toContainText('87%');
});

test('profile shows region performance', async ({ page }) => {
  await mockApi(page, { statsVariant: 'one-session' });
  await page.goto('/en/profile');

  await page.getByTestId('profile-stats').waitFor();
  // Piemonte (piedmont SVG ID) should appear as a top region
  await expect(page.locator('text=Piemonte')).toBeVisible();
  // Sardegna (sardinia SVG ID) should appear as a region to improve
  await expect(page.locator('text=Sardegna')).toBeVisible();
});

test('completing a game session calls POST /session', async ({ page }) => {
  let sessionSaved = false;
  await mockApi(page);

  // Override session route to detect when it's called
  await page.route('**/session', (route) => {
    if (route.request().method() === 'POST') {
      sessionSaved = true;
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 1 }), status: 201 });
    } else {
      route.fallback();
    }
  });

  await page.goto('/en');
  await page.getByTestId('start-button').click();
  await page.getByTestId('active-card').waitFor();

  for (let i = 0; i < 10; i++) {
    const cardName = (await page.getByTestId('card-name').textContent())?.trim();
    const svgIds = DENOM_SVG_REGIONS[cardName!];
    for (const svgId of svgIds) {
      await dragToRegion(page, svgId);
      await page.waitForTimeout(300);
    }
    if (i < 9) {
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

  await page.waitForURL('**/recap**', { timeout: 5000 });
  // Give the useEffect time to fire
  await page.waitForTimeout(1000);
  expect(sessionSaved).toBe(true);
});
