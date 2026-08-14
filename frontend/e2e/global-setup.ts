import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const TEST_USER = {
  email: 'e2e-test@sommelier.test',
  password: 'e2eTestPassword99',
  first_name: 'Test',
  last_name: 'User',
};

// A second account, promoted to admin through the very promotion path used at
// boot, with its session saved separately. Admin specs opt into it explicitly;
// every other spec keeps the plain player session as its default.
const ADMIN_USER = {
  email: 'e2e-admin@sommelier.test',
  password: 'e2eAdminPassword99',
  first_name: 'Admin',
  last_name: 'User',
};

async function register(apiUrl: string, user: typeof TEST_USER) {
  await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
}

async function saveSession(email: string, password: string, storagePath: string) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3000/en/login');
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL('**/en', { timeout: 10_000 });

  await context.storageState({ path: storagePath });
  await browser.close();
}

/**
 * Promote the admin account through the same script that runs at boot
 * (backend/scripts/promote_admin.py). Setting INITIAL_ADMIN_EMAIL to the admin
 * account and invoking the script exercises the real promotion code path — the
 * promote-into-a-vacuum rule and all — rather than a shortcut that only the
 * tests would ever take.
 */
function promoteAdmin() {
  const backendDir = path.resolve(__dirname, '..', '..', 'backend');
  execFileSync('uv', ['run', 'python', 'scripts/promote_admin.py'], {
    cwd: backendDir,
    env: { ...process.env, INITIAL_ADMIN_EMAIL: ADMIN_USER.email },
    stdio: 'inherit',
  });
}

async function globalSetup() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

  await register(apiUrl, TEST_USER);
  await register(apiUrl, ADMIN_USER);
  promoteAdmin();

  await saveSession(TEST_USER.email, TEST_USER.password, 'playwright/.auth/user.json');
  await saveSession(ADMIN_USER.email, ADMIN_USER.password, 'playwright/.auth/admin.json');
}

export default globalSetup;
