import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";
import {
  createInterview,
  getInterview,
  listInterviewEvents,
  uploadRecording,
} from "@/lib/server/store";
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

describe("POST /api/interviews/[id]/recording/complete", () => {
  it("rejects requests without a candidate session", async () => {
    const { context, interview } = await makeInterview();
    const response = await POST(
      makeRequest({
        body: { recordingPath: `${interview.id}/recording.webm` },
      }),
      context,
    );

    expect(response.status).toBe(401);
  });

  it("rejects recording paths outside the interview folder", async () => {
    const { context, cookie } = await makeInterview();
    const response = await POST(
      makeRequest({
        body: { recordingPath: "other-interview/recording.webm" },
        cookie,
      }),
      context,
    );

    expect(response.status).toBe(400);
  });

  it("persists a directly uploaded recording path and event", async () => {
    const { context, cookie, interview } = await makeInterview();
    const recordingPath = await uploadRecording(
      interview.id,
      new File([new Uint8Array(1024)], "recording.webm", {
        type: "audio/webm",
      }),
    );

    const response = await POST(
      makeRequest({
        body: {
          recordingPath,
          contentType: "audio/webm",
          size: 1024,
        },
        cookie,
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ recordingPath });
    await expect(getInterview(interview.id)).resolves.toMatchObject({
      recordingPath,
    });
    const events = await listInterviewEvents(interview.id);
    expect(events.find((event) => event.type === "recording_uploaded")).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ recordingPath }),
      }),
    );
  });

  it("rejects completion when the storage object is missing", async () => {
    const { context, cookie, interview } = await makeInterview();
    const response = await POST(
      makeRequest({
        body: { recordingPath: `${interview.id}/recording.webm` },
        cookie,
      }),
      context,
    );

    expect(response.status).toBe(404);
  });
});
