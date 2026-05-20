import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const summarizeInterviewMock = vi.fn();

vi.mock("@/lib/server/openai", () => ({
  summarizeInterview: (...args: unknown[]) => summarizeInterviewMock(...args),
}));

import { POST } from "./route";
import {
  appendInterviewEvents,
  createInterview,
  getInterview,
  getInterviewSummary,
  listInterviewEvents,
  saveInterviewSummary,
  updateInterview,
} from "@/lib/server/store";
import { signCandidateSession } from "@/lib/server/candidate-session";

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.OPENAI_API_KEY = "";
  summarizeInterviewMock.mockReset();
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

describe("POST /api/interviews/[id]/complete", () => {
  it("rejects without a candidate session", async () => {
    const { context } = await makeInterview();
    const response = await POST(makeRequest(undefined), context);
    expect(response.status).toBe(401);
  });

  it("generates a summary on first call and marks completed", async () => {
    const { context, cookie, interview } = await makeInterview();
    summarizeInterviewMock.mockResolvedValue({
      model: "test-model",
      evidence: ["something"],
      strengths: [],
      risks: [],
      followUpQuestions: [],
    });
    const response = await POST(makeRequest(cookie), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.interview.status).toBe("completed");
    expect(body.summary.model).toBe("test-model");

    const persisted = await getInterview(interview.id);
    expect(persisted?.status).toBe("completed");
  });

  it("is idempotent: a second call returns the existing summary without writing new events", async () => {
    const { context, cookie, interview } = await makeInterview();
    summarizeInterviewMock.mockResolvedValue({
      model: "test-model",
      evidence: [],
      strengths: [],
      risks: [],
      followUpQuestions: [],
    });
    await POST(makeRequest(cookie), context);
    const eventsAfterFirst = await listInterviewEvents(interview.id);
    const firstCompletedAt = (await getInterview(interview.id))?.completedAt;
    summarizeInterviewMock.mockClear();

    const response = await POST(makeRequest(cookie), context);
    expect(response.status).toBe(200);
    expect(summarizeInterviewMock).not.toHaveBeenCalled();

    const eventsAfterSecond = await listInterviewEvents(interview.id);
    expect(eventsAfterSecond).toHaveLength(eventsAfterFirst.length);
    const refreshed = await getInterview(interview.id);
    expect(refreshed?.completedAt).toBe(firstCompletedAt);
  });

  it("falls back to a placeholder summary when summarization fails", async () => {
    const { context, cookie, interview } = await makeInterview();
    summarizeInterviewMock.mockRejectedValue(new Error("upstream failure"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await POST(makeRequest(cookie), context);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.interview.status).toBe("completed");
      expect(body.summary.model).toBe("summary-failed");
      expect(body.summary.risks[0]).toContain("upstream failure");
    } finally {
      errorSpy.mockRestore();
    }

    const stored = await getInterviewSummary(interview.id);
    expect(stored?.model).toBe("summary-failed");
  });

  it("attaches transcriptPath from prior diarized_transcript event", async () => {
    const { context, cookie, interview } = await makeInterview();
    await appendInterviewEvents(interview.id, [
      {
        source: "system",
        type: "diarized_transcript",
        text: "transcript",
        payload: { transcriptPath: `${interview.id}/transcript.json` },
      },
    ]);
    summarizeInterviewMock.mockResolvedValue({
      model: "m",
      evidence: [],
      strengths: [],
      risks: [],
      followUpQuestions: [],
    });
    await POST(makeRequest(cookie), context);
    const summary = await getInterviewSummary(interview.id);
    expect(summary?.transcriptPath).toBe(`${interview.id}/transcript.json`);
  });

  it("returns existing summary when one was already saved manually", async () => {
    const { context, cookie, interview } = await makeInterview();
    await saveInterviewSummary(interview.id, {
      model: "manual",
      evidence: ["preset"],
      strengths: [],
      risks: [],
      followUpQuestions: [],
    });
    // Mark not completed yet so we hit the existing-but-not-completed branch.
    await updateInterview(interview.id, { status: "in_progress" });

    const response = await POST(makeRequest(cookie), context);
    expect(response.status).toBe(200);
    expect(summarizeInterviewMock).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.summary.model).toBe("manual");
    expect(body.interview.status).toBe("completed");
  });
});
