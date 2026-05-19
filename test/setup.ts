import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "interview-agent-"));
  process.env.INTERVIEW_AGENT_STORE_FILE = path.join(dir, "store.json");
  process.env.INVITE_SIGNING_SECRET = "test-invite-signing-secret";
  process.env.AUTH0_DOMAIN = "example.auth0.com";
  process.env.AUTH0_CLIENT_ID = "test-client-id";
  process.env.AUTH0_CLIENT_SECRET = "test-client-secret";
  process.env.AUTH0_SECRET =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
