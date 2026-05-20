import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";
import { createInterview } from "@/lib/server/store";
import { signCandidateSession } from "@/lib/server/candidate-session";

function makeRequest({
  body,
  cookie,
}: {
  body: unknown | (() => Promise<unknown>);
  cookie?: string;
}) {
  const cookieMap = new Map<string, { value: string }>();
  if (cookie) cookieMap.set("ia_candidate_session", { value: cookie });
  return {
    json:
      typeof body === "function"
        ? (body as () => Promise<unknown>)
        : async () => body,
    cookies: { get: (name: string) => cookieMap.get(name) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function makeInterview() {
  const interview = await createInterview({
    candidateName: "Ada",
    roleTitle: "Backend",
    level: "L4",
    jobDescription: "",
    parsedResume: {
      headline: "",
      skills: [],
      experience: [],
      projects: [],
      education: [],
      highSignalClaims: [],
    },
  });
  return {
    interview,
    cookie: signCandidateSession(interview.id),
    context: { params: Promise.resolve({ id: interview.id }) },
  };
}

describe("POST /api/interviews/[id]/recording/upload-url", () => {
  it("rejects requests without a candidate session", async () => {
    const { context } = await makeInterview();
    const response = await POST(
      makeRequest({
        body: { filename: "interview.webm", contentType: "audio/webm", size: 1 },
      }),
      context,
    );

    expect(response.status).toBe(401);
  });

  it("validates recording metadata before creating an upload URL", async () => {
    const { context, cookie } = await makeInterview();
    const response = await POST(
      makeRequest({
        body: {
          filename: "interview.bin",
          contentType: "application/octet-stream",
          size: 1,
        },
        cookie,
      }),
      context,
    );

    expect(response.status).toBe(415);
  });

  it("returns 400 when JSON body is malformed", async () => {
    const { context, cookie } = await makeInterview();
    const response = await POST(
      makeRequest({
        body: async () => {
          throw new SyntaxError("bad json");
        },
        cookie,
      }),
      context,
    );

    expect(response.status).toBe(400);
  });

  it("rejects empty and oversized recording metadata", async () => {
    const { context, cookie } = await makeInterview();

    const empty = await POST(
      makeRequest({
        body: { filename: "interview.webm", contentType: "audio/webm", size: 0 },
        cookie,
      }),
      context,
    );
    expect(empty.status).toBe(400);

    const oversized = await POST(
      makeRequest({
        body: {
          filename: "interview.webm",
          contentType: "audio/webm",
          size: 200 * 1024 * 1024 + 1,
        },
        cookie,
      }),
      context,
    );
    expect(oversized.status).toBe(413);
  });

  it("returns 404 when the interview does not exist", async () => {
    const cookie = signCandidateSession("missing");
    const response = await POST(
      makeRequest({
        body: { filename: "interview.webm", contentType: "audio/webm", size: 1 },
        cookie,
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(404);
  });

  it("falls back to the multipart route when Supabase storage is unavailable", async () => {
    const { context, cookie } = await makeInterview();
    const response = await POST(
      makeRequest({
        body: { filename: "interview.webm", contentType: "audio/webm", size: 1024 },
        cookie,
      }),
      context,
    );

    expect(response.status).toBe(501);
  });
});
