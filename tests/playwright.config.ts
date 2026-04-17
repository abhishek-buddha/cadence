import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

// ESM-safe __dirname (package.json has "type": "module")
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.test if present (local runs); CI sets env vars directly.
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

const BASE_URL = process.env.CADENCE_BASE_URL ?? 'https://cadence-new.onrender.com';
const API_BASE = process.env.CADENCE_API_BASE ?? 'https://colorless-cardinal-959.convex.site';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 1,
  workers: 4,
  fullyParallel: true,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
    ['json', { outputFile: 'test-results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // NOTE: do NOT set extraHTTPHeaders here — it applies to *all* browser requests
    // including font/CDN preflights, causing CORS failures that pollute the console
    // and break "no console errors" assertions. Test-run header is set per-API-context
    // in fixtures/api.ts where it only affects /v1 API calls.
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // Other browsers (firefox/webkit) and viewports added later as the suite grows.
  ],
});

// Re-export for fixtures that need the resolved API base URL.
export const RUNTIME = { BASE_URL, API_BASE };
