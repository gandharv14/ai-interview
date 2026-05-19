import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const storePath = path.join(process.cwd(), ".local-data", "e2e-store.json");
const auth0Secret =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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
      OPENAI_API_KEY: "",
      INVITE_SIGNING_SECRET: "test-invite-signing-secret",
      AUTH0_DOMAIN: "example.auth0.com",
      AUTH0_CLIENT_ID: "test-client-id",
      AUTH0_CLIENT_SECRET: "test-client-secret",
      AUTH0_SECRET: auth0Secret,
      APP_BASE_URL: "http://localhost:3100",
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
