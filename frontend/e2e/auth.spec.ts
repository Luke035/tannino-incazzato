import { test, expect, chromium } from '@playwright/test';

// Auth tests run without stored session — each test manages its own auth state
test.use({ storageState: { cookies: [], origins: [] } });

const UNIQUE = () => `test-${Date.now()}@sommelier.test`;
const PASSWORD = 'TestPassword99';

// ── Registration ──────────────────────────────────────────────────────────────

test('register with valid data logs in and redirects to home', async ({ page }) => {
  const email = UNIQUE();
  await page.goto('/en/register');

  await page.fill('#reg-nome', 'Mario');
  await page.fill('#reg-cognome', 'Rossi');
  await page.fill('#reg-email', email);
  await page.fill('#reg-password', PASSWORD);
  await page.fill('#reg-confirm', PASSWORD);
  await page.click('[data-testid="register-submit"]');

  await page.waitForURL('**/en', { timeout: 8_000 });
  await expect(page).toHaveURL(/\/en$/);
});

test('register with duplicate email shows error message', async ({ page }) => {
  const email = UNIQUE();
  const payload = { email, password: PASSWORD, first_name: 'A', last_name: 'B' };
  await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  await page.goto('/en/register');
  await page.fill('#reg-nome', 'A');
  await page.fill('#reg-cognome', 'B');
  await page.fill('#reg-email', email);
  await page.fill('#reg-password', PASSWORD);
  await page.fill('#reg-confirm', PASSWORD);
  await page.click('[data-testid="register-submit"]');

  await expect(page.getByText(/già registrata/i)).toBeVisible({ timeout: 5_000 });
});

test('register with mismatched passwords shows client-side error', async ({ page }) => {
  await page.goto('/en/register');

  await page.fill('#reg-nome', 'A');
  await page.fill('#reg-cognome', 'B');
  await page.fill('#reg-email', UNIQUE());
  await page.fill('#reg-password', PASSWORD);
  await page.fill('#reg-confirm', 'differentpassword');
  await page.click('[data-testid="register-submit"]');

  await expect(page.getByText(/non coincidono/i)).toBeVisible();
});

// ── Login ─────────────────────────────────────────────────────────────────────

test('login with correct credentials redirects to home', async ({ page }) => {
  const email = UNIQUE();
  await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, first_name: 'X', last_name: 'Y' }),
  });

  await page.goto('/en/login');
  await page.fill('#login-email', email);
  await page.fill('#login-password', PASSWORD);
  await page.click('[data-testid="login-submit"]');

  await page.waitForURL('**/en', { timeout: 8_000 });
  await expect(page).toHaveURL(/\/en$/);
});

test('login with wrong password shows error', async ({ page }) => {
  await page.goto('/en/login');
  await page.fill('#login-email', 'nobody@sommelier.test');
  await page.fill('#login-password', 'wrongpassword');
  await page.click('[data-testid="login-submit"]');

  await expect(page.getByText(/non corretti/i)).toBeVisible({ timeout: 5_000 });
});

// ── Protected routes ──────────────────────────────────────────────────────────

test('visiting /game without session redirects to login with next param', async ({ page }) => {
  await page.goto('/en/game');
  await page.waitForURL('**/login**', { timeout: 5_000 });
  expect(page.url()).toContain('/login');
  expect(page.url()).toContain('next=');
});

test('visiting /quiz without session redirects to login with next param', async ({ page }) => {
  await page.goto('/en/quiz');
  await page.waitForURL('**/login**', { timeout: 5_000 });
  expect(page.url()).toContain('/login');
  expect(page.url()).toContain('next=');
});

test('visiting home / without session redirects to login', async ({ page }) => {
  await page.goto('/en');
  await page.waitForURL('**/login**', { timeout: 5_000 });
  expect(page.url()).toContain('/login');
});

// ── Redirect when already logged in ──────────────────────────────────────────

test('visiting /login when already logged in redirects to home', async ({ browser }) => {
  // Use the stored auth session for this test only
  const context = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
  const page = await context.newPage();

  await page.goto('/en/login');
  await page.waitForURL('**/en', { timeout: 5_000 });
  await expect(page).toHaveURL(/\/en$/);

  await context.close();
});

// ── Logout ────────────────────────────────────────────────────────────────────

test('logout clears session and shows Esci button gone', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
  const page = await context.newPage();

  await page.goto('/en');
  await expect(page.getByRole('button', { name: 'Esci' })).toBeVisible();

  await page.getByRole('button', { name: 'Esci' }).click();
  await page.waitForURL('**/login**', { timeout: 5_000 });

  await context.close();
});
