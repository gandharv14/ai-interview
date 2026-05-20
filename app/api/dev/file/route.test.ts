import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GET } from "./route";

let storeDir: string;

function makeRequest(query: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === "string") params.set(k, v);
  }
  return {
    nextUrl: {
      searchParams: params,
    },
  } as unknown as NextRequest;
}

beforeEach(async () => {
  storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "interview-agent-dev-file-"));
  process.env.INTERVIEW_AGENT_STORE_FILE = path.join(storeDir, "store.json");
  delete process.env.NODE_ENV;
  delete process.env.VERCEL;
  // Pre-create an uploads directory + a real file in the resumes bucket.
  const uploadsRoot = path.join(storeDir, "uploads", "resumes", "interview-1");
  await fs.mkdir(uploadsRoot, { recursive: true });
  await fs.writeFile(path.join(uploadsRoot, "resume.pdf"), "%PDF-1.4 dummy");
});

afterEach(async () => {
  await fs.rm(storeDir, { recursive: true, force: true });
});

describe("GET /api/dev/file", () => {
  it("returns the file when bucket and path are valid", async () => {
    const response = await GET(
      makeRequest({ bucket: "resumes", path: "interview-1/resume.pdf" }),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("%PDF");
  });

  it("rejects unknown buckets", async () => {
    const response = await GET(
      makeRequest({ bucket: "secrets", path: "anything" }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid bucket" });
  });

  it("rejects path traversal attempts", async () => {
    for (const bad of [
      "../etc/passwd",
      "interview-1/../../../etc/passwd",
      "/etc/passwd",
      "..\\windows",
      "interview-1/foo\u0000.pdf",
    ]) {
      const response = await GET(
        makeRequest({ bucket: "resumes", path: bad }),
      );
      expect(response.status, `path=${bad}`).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid path" });
    }
  });

  it("returns 404 when the resolved file does not exist", async () => {
    const response = await GET(
      makeRequest({ bucket: "resumes", path: "missing/file.pdf" }),
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 in production regardless of inputs", async () => {
    process.env.NODE_ENV = "production";
    const response = await GET(
      makeRequest({ bucket: "resumes", path: "interview-1/resume.pdf" }),
    );
    expect(response.status).toBe(404);
  });

  it("returns 400 when params are missing", async () => {
    const response = await GET(makeRequest({}));
    expect(response.status).toBe(400);
  });
});
