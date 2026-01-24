/**
 * Playwright Configuration for Chrome Extension E2E Testing
 *
 * This configuration sets up Playwright to test the AI Subtitle Translator
 * Chrome extension in a real browser environment.
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// Path to the built extension
const extensionPath = path.join(__dirname, 'dist');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Extensions require sequential execution
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for extension testing
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    // Collect trace on failure for debugging
    trace: 'on-first-retry',
    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Launch Chrome with the extension loaded
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
          ],
          headless: false, // Extensions require headed mode
        },
      },
    },
  ],

  // Build extension before running tests
  webServer: {
    command: 'npm run build',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
