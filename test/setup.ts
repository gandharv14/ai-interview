import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "interview-agent-"));
  process.env.INTERVIEW_AGENT_STORE_FILE = path.join(dir, "store.json");
  process.env.ADMIN_PASSPHRASE = "admin-dev-passphrase";
  process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret";
  process.env.INVITE_SIGNING_SECRET = "test-invite-signing-secret";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
