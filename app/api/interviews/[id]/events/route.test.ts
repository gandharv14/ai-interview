import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";
import { createInterview } from "@/lib/server/store";
import { signCandidateSession } from "@/lib/server/candidate-session";

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

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
    cookie: signCandidateSession(interview.id),
    context: { params: Promise.resolve({ id: interview.id }) },
    interview,
  };
}

describe("POST /api/interviews/[id]/events", () => {
  it("rejects without a candidate session", async () => {
    const { context } = await makeInterview();
    const response = await POST(
      makeRequest({ body: { events: [] } }),
      context,
    );
    expect(response.status).toBe(401);
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

  it("returns 400 with issues when payload fails schema", async () => {
    const { context, cookie } = await makeInterview();
    const response = await POST(
      makeRequest({ body: { events: [] }, cookie }),
      context,
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid event payload");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("appends valid events", async () => {
    const { context, cookie } = await makeInterview();
    const response = await POST(
      makeRequest({
        body: {
          events: [
            { source: "candidate", type: "speech", text: "Hello" },
          ],
        },
        cookie,
      }),
      context,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].text).toBe("Hello");
  });
});
