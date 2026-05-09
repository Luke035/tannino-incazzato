import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    hasTouch: false,
    storageState: 'playwright/.auth/user.json',
  },
  timeout: 30_000,
  reporter: 'list',
  // No webServer — tests assume the full stack is already running
});
