import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["manual-supabase.spec.ts"],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.MANUAL_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
