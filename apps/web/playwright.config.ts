import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
