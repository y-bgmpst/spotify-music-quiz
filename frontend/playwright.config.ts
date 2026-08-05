import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * Both servers are started here. The previous config started only Vite, so
 * every test that touched the API failed with "Failed to fetch" and the suite
 * could never pass. The backend runs against a throwaway database and a fixed
 * seed so runs are deterministic and never touch developer data.
 */
const PYTHON = process.env.E2E_PYTHON ?? 'python3';
const BACKEND_PORT = 8123;
const FRONTEND_PORT = 5273;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // 'chromium' channel runs the full browser rather than the headless
      // shell, which some CI images lack shared libraries for.
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: [
    {
      // The database is wiped first so every run starts from an empty, known state.
      command: `sh -c 'rm -f .data/e2e.db && ${PYTHON} -m uvicorn music_quiz.main:app --host 127.0.0.1 --port ${BACKEND_PORT}'`,
      cwd: '../backend',
      url: `${BACKEND_URL}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        // Isolated database per run: E2E never mutates the developer database.
        DATABASE_PATH: '.data/e2e.db',
        SPOTIFY_CLIENT_ID: 'e2e-client-id',
        SPOTIFY_REDIRECT_URI: `${BACKEND_URL}/api/v1/auth/callback`,
        FRONTEND_ORIGIN: FRONTEND_URL,
        ALLOW_LOCALHOST_ORIGIN: '0',
        PYTHONPATH: 'src',
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`,
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { VITE_API_URL: `${BACKEND_URL}/api/v1` },
    },
  ],
});
