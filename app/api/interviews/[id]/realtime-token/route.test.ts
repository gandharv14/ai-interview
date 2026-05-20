import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mintRealtimeClientSecretMock = vi.fn();

vi.mock("@/lib/server/openai", () => ({
  mintRealtimeClientSecret: (...args: unknown[]) =>
    mintRealtimeClientSecretMock(...args),
}));

import { POST } from "./route";
import {
  createInterview,
  getInterview,
  listInterviewEvents,
  updateInterview,
} from "@/lib/server/store";
import { signCandidateSession } from "@/lib/server/candidate-session";

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  mintRealtimeClientSecretMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRequest(cookie: string | undefined) {
  const cookieMap = new Map<string, { value: string }>();
  if (cookie) cookieMap.set("ia_candidate_session", { value: cookie });
  return {
    cookies: { get: (name: string) => cookieMap.get(name) },
  } as unknown as NextRequest;
}

async function makeInterview(status: "ready" | "in_progress" | "completed" | "failed" = "ready") {
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
  if (status !== "ready") {
    await updateInterview(interview.id, { status });
  }
  return {
    id: interview.id,
    cookie: signCandidateSession(interview.id),
    context: { params: Promise.resolve({ id: interview.id }) },
  };
}

describe("POST /api/interviews/[id]/realtime-token", () => {
  it("rejects without a candidate session", async () => {
    const { context } = await makeInterview();
    const response = await POST(makeRequest(undefined), context);
    expect(response.status).toBe(401);
  });

  it("transitions ready to in_progress and writes one realtime_started event", async () => {
    const { context, cookie, id } = await makeInterview();
    mintRealtimeClientSecretMock.mockResolvedValue({
      clientSecret: "rt_secret",
      model: "gpt-realtime-2",
    });
    const response = await POST(makeRequest(cookie), context);
    expect(response.status).toBe(200);
    const refreshed = await getInterview(id);
    expect(refreshed?.status).toBe("in_progress");
    expect(refreshed?.startedAt).toBeDefined();
    const events = await listInterviewEvents(id);
    expect(events.filter((e) => e.type === "realtime_started")).toHaveLength(1);
    expect(events.filter((e) => e.type === "realtime_resumed")).toHaveLength(0);
  });

  it("subsequent calls in in_progress emit realtime_resumed, capped at the limit", async () => {
    const { context, cookie, id } = await makeInterview("in_progress");
    mintRealtimeClientSecretMock.mockResolvedValue({
      clientSecret: "rt",
      model: "gpt-realtime-2",
    });
    for (let i = 0; i < 12; i++) {
      const response = await POST(makeRequest(cookie), context);
      expect(response.status).toBe(200);
    }
    const events = await listInterviewEvents(id);
    expect(events.filter((e) => e.type === "realtime_resumed")).toHaveLength(10);
    expect(events.filter((e) => e.type === "realtime_started")).toHaveLength(0);
  });

  it("does not mutate state if minting the client secret fails", async () => {
    const { context, cookie, id } = await makeInterview();
    mintRealtimeClientSecretMock.mockRejectedValue(new Error("openai down"));
    await expect(
      POST(makeRequest(cookie), context),
    ).rejects.toThrow(/openai down/);
    const refreshed = await getInterview(id);
    expect(refreshed?.status).toBe("ready");
    const events = await listInterviewEvents(id);
    expect(events).toHaveLength(0);
  });

  it("returns 409 when interview is completed", async () => {
    const { context, cookie } = await makeInterview("completed");
    mintRealtimeClientSecretMock.mockResolvedValue({ clientSecret: "rt", model: "x" });
    const response = await POST(makeRequest(cookie), context);
    expect(response.status).toBe(409);
    expect(mintRealtimeClientSecretMock).not.toHaveBeenCalled();
  });

  it("returns 409 when interview is failed", async () => {
    const { context, cookie } = await makeInterview("failed");
    mintRealtimeClientSecretMock.mockResolvedValue({ clientSecret: "rt", model: "x" });
    const response = await POST(makeRequest(cookie), context);
    expect(response.status).toBe(409);
    expect(mintRealtimeClientSecretMock).not.toHaveBeenCalled();
  });
});
