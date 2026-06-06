import { defineConfig, devices } from "@playwright/test";

const port = 3020;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"]
      }
    }
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    env: {
      APP_AUTH_MODE: "test",
      AUTH_SESSION_SECRET: "playwright-test-session-secret-at-least-32-characters",
      NOTIFICATION_TEST_RECIPIENT: "playwright@example.com"
    },
    reuseExistingServer: true,
    timeout: 180_000,
    url: `${baseURL}/api/v1/health`
  }
});
