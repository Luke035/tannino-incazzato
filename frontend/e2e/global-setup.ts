import { chromium } from '@playwright/test';

const TEST_USER = {
  email: 'e2e-test@sommelier.test',
  password: 'e2eTestPassword99',
  first_name: 'Test',
  last_name: 'User',
};

async function globalSetup() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

  // Ensure the test user exists (register or ignore conflict)
  await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_USER),
  });

  // Log in and save the session cookie
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3000/en/login');
  await page.fill('#login-email', TEST_USER.email);
  await page.fill('#login-password', TEST_USER.password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL('**/en', { timeout: 10_000 });

  await context.storageState({ path: 'playwright/.auth/user.json' });
  await browser.close();
}

export default globalSetup;
