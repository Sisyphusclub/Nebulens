import { defineConfig, devices } from '@playwright/test';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5180';
export const MOCK_UPSTREAM_URL = process.env.E2E_MOCK_UPSTREAM_URL ?? 'http://localhost:4010';
export const ADMIN_STATE = '.auth/admin.json';
export const SKILLS_STATE = '.auth/skills.json';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // One shared account, quota and mock upstream: run serially, and do not retry.
  // A full run makes about 7 generation requests against a limit of 10 per user
  // per minute, so wait a minute before re-running against the same stack.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    storageState: ADMIN_STATE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
