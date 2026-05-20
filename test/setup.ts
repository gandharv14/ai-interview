import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TRACKED_ENV_VARS = [
  "OPENAI_API_KEY",
  "OPENAI_TEXT_MODEL",
  "OPENAI_REALTIME_MODEL",
  "OPENAI_TRANSCRIBE_MODEL",
  "OPENAI_REALTIME_TRANSCRIBE_MODEL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INVITE_SIGNING_SECRET",
  "INTERVIEW_AGENT_STORE_FILE",
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET",
  "AUTH0_ADMIN_EMAILS",
  "APP_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_MOCK_REALTIME",
  "NODE_ENV",
  "VERCEL",
] as const;

let envSnapshot = new Map<string, string | undefined>();

beforeEach(async () => {
  envSnapshot = new Map(
    TRACKED_ENV_VARS.map((key) => [key, process.env[key]] as const),
  );

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
  // Default to "no Supabase configured" so the local file store is used.
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Default to no OpenAI key (heuristic resume + placeholder summary).
  delete process.env.OPENAI_API_KEY;
  // Default to dev runtime so production guards do not fire by surprise.
  delete process.env.NODE_ENV;
  delete process.env.VERCEL;
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, value] of envSnapshot.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});
