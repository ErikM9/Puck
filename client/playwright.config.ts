import { defineConfig, devices } from '@playwright/test';

/* One browser locally and all three on CI, as three browsers take three times as long for mostly the same answers */
const everyBrowser = !!process.env.CI || !!process.env.E2E_ALL_BROWSERS;

/* Ports of its own, so a development stack on 5173 and 5000 can keep running during a test run */
const CLIENT_PORT = 5174;
const API_PORT = 5001;

/* Drives a real browser, covering the seams the jsdom component tests cannot reach */
export default defineConfig({
  testDir: './e2e',
  /* Each test mints its own account and decks, so none depends on another */
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

  /* Set for the heaviest journey, a deck built through the form against a busy database */
  timeout: 90_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${CLIENT_PORT}`,
    /* Kept for every failure rather than on the first retry, as a local run has no retries */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    /* Off, as recording every test slows the run and a failure's trace already holds a filmstrip of it */
    video: 'off',
  },

  projects: everyBrowser
    ? [
        { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
        /* A phone profile as well, because so much of this layout depends on the viewport */
        { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
      ]
    : [{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      /* --mode e2e picks up .env.e2e, which points the app at the API below */
      command: `npm run dev -- --mode e2e --port ${CLIENT_PORT} --strictPort`,
      url: `http://localhost:${CLIENT_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      /* Started with node rather than npm, whose shell on Windows can leave node holding the port when stopped */
      command: 'node index.js',
      cwd: '../server',
      url: `http://localhost:${API_PORT}/health`,
      /* Never reused, as a server started elsewhere would lack the settings below */
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: String(API_PORT),
        /* The browser is served from the port above, and CORS has to agree */
        CLIENT_ORIGIN: `http://localhost:${CLIENT_PORT}`,
        /* The suite would otherwise exhaust the production cap of 20 partway through */
        AUTH_RATE_LIMIT_MAX: '1000',
        /* Deliberate silence rather than absent credentials, so it is not reported as a fault */
        EMAIL_DISABLED: '1',
      },
    },
  ],
});