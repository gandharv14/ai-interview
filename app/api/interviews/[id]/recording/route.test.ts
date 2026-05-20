import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/server/openai", () => ({
  transcribeRecordingIfSmall: vi.fn(async () => undefined),
}));

import { POST } from "./route";
import { createInterview, listInterviewEvents } from "@/lib/server/store";
import { signCandidateSession } from "@/lib/server/candidate-session";

function makeRequest({
  formData,
  cookie,
}: {
  formData: FormData;
  cookie?: string;
}) {
  const cookieMap = new Map<string, { value: string }>();
  if (cookie) {
    cookieMap.set("ia_candidate_session", { value: cookie });
  }
  return {
    formData: async () => formData,
    cookies: {
      get: (name: string) => cookieMap.get(name),
    },
  } as unknown as NextRequest;
}

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.OPENAI_API_KEY = "";
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

describe("POST /api/interviews/[id]/recording", () => {
  it("rejects requests without a candidate session", async () => {
    const { context } = await makeInterview();
    const formData = new FormData();
    formData.set(
      "recording",
      new File([new Uint8Array(1024)], "rec.webm", { type: "audio/webm" }),
    );
    const response = await POST(makeRequest({ formData }), context);
    expect(response.status).toBe(401);
  });

  it("rejects oversize uploads", async () => {
    const { context, cookie } = await makeInterview();
    const formData = new FormData();
    // 200MB + 1
    const big = new Uint8Array(200 * 1024 * 1024 + 1);
    formData.set(
      "recording",
      new File([big], "rec.webm", { type: "audio/webm" }),
    );
    const response = await POST(makeRequest({ formData, cookie }), context);
    expect(response.status).toBe(413);
  });

  it("rejects unsupported MIME types", async () => {
    const { context, cookie } = await makeInterview();
    const formData = new FormData();
    formData.set(
      "recording",
      new File([new Uint8Array(10)], "rec.bin", {
        type: "application/octet-stream",
      }),
    );
    const response = await POST(makeRequest({ formData, cookie }), context);
    expect(response.status).toBe(415);
  });

  it("rejects empty files", async () => {
    const { context, cookie } = await makeInterview();
    const formData = new FormData();
    formData.set(
      "recording",
      new File([], "rec.webm", { type: "audio/webm" }),
    );
    const response = await POST(makeRequest({ formData, cookie }), context);
    expect(response.status).toBe(400);
  });

  it("falls back to webm when filename has no extension", async () => {
    const { context, cookie, interview } = await makeInterview();
    const formData = new FormData();
    formData.set(
      "recording",
      new File([new Uint8Array(1024)], "audio", { type: "audio/webm" }),
    );
    const response = await POST(makeRequest({ formData, cookie }), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recordingPath).toBe(`${interview.id}/recording.webm`);
  });

  it("uses last extension for multi-dot filenames", async () => {
    const { context, cookie, interview } = await makeInterview();
    const formData = new FormData();
    formData.set(
      "recording",
      new File([new Uint8Array(1024)], "interview.audio.mp3", {
        type: "audio/mp3",
      }),
    );
    const response = await POST(makeRequest({ formData, cookie }), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recordingPath).toBe(`${interview.id}/recording.mp3`);
  });

  it("appends recording_uploaded event on success", async () => {
    const { context, cookie, interview } = await makeInterview();
    const formData = new FormData();
    formData.set(
      "recording",
      new File([new Uint8Array(1024)], "rec.webm", { type: "audio/webm" }),
    );
    const response = await POST(makeRequest({ formData, cookie }), context);
    expect(response.status).toBe(200);
    const events = await listInterviewEvents(interview.id);
    expect(events.find((event) => event.type === "recording_uploaded")).toBeDefined();
  });
});
