import { test, expect } from '@playwright/test';

/**
 * The panel's two answers (ADR 0014 / issue #39): a player who reaches the URL
 * is turned away in the browser; an admin reaches it. These specs opt into the
 * admin session explicitly — every other spec uses the plain player default.
 */

test.describe('admin panel', () => {
  test('a player reaching the panel URL is turned away', async ({ browser }) => {
    // The default stored session is a plain registered player.
    const context = await browser.newContext({
      storageState: 'playwright/.auth/user.json',
    });
    const page = await context.newPage();

    await page.goto('/en/admin');
    // The browser redirects a signed-in non-admin home; the panel chrome never
    // renders for them.
    await page.waitForURL('**/en', { timeout: 8_000 });
    await expect(page).toHaveURL(/\/en$/);

    await context.close();
  });

  test('an admin reaches the panel', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'playwright/.auth/admin.json',
    });
    const page = await context.newPage();

    await page.goto('/en/admin');
    await expect(page).toHaveURL(/\/en\/admin$/);
    await expect(page.getByText(/Welcome to the panel/i)).toBeVisible({ timeout: 8_000 });

    await context.close();
  });
});
