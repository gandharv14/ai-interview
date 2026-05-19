import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const storePath = path.join(process.cwd(), ".local-data", "e2e-store.json");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    env: {
      ADMIN_PASSPHRASE: "admin-dev-passphrase",
      ADMIN_SESSION_SECRET: "test-admin-session-secret",
      INVITE_SIGNING_SECRET: "test-invite-signing-secret",
      INTERVIEW_AGENT_STORE_FILE: storePath,
      NEXT_PUBLIC_APP_URL: "http://localhost:3100",
      NEXT_PUBLIC_MOCK_REALTIME: "1",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
