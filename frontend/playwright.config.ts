import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
    // Keep pointer events available for dnd-kit drag simulation
    hasTouch: false,
  },
  timeout: 30_000,
  reporter: 'list',
  // No webServer — tests assume the full stack is already running
});
