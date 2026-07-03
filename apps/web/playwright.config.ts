import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.WEAVE_E2E_URL || "http://127.0.0.1:3200";
const apiURL = process.env.WEAVE_E2E_API || "http://127.0.0.1:8787";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  ...(process.env.WEAVE_E2E_URL
    ? {}
    : {
        webServer: {
          command: "pnpm dev",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
          env: {
            NEXT_PUBLIC_WEAVE_API: apiURL,
          },
        },
      }),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
