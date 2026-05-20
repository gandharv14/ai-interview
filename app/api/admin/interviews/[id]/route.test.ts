import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const isAdminRequestMock = vi.fn();

vi.mock("@/lib/server/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/admin")>(
    "@/lib/server/admin",
  );
  return {
    ...actual,
    isAdminRequest: (...args: unknown[]) => isAdminRequestMock(...args),
  };
});

import { DELETE } from "./route";
import {
  appendInterviewEvents,
  createInterview,
  getInterview,
  getInterviewSummary,
  listInterviewEvents,
  saveInterviewSummary,
} from "@/lib/server/store";

beforeEach(() => {
  isAdminRequestMock.mockReset();
  delete process.env.NODE_ENV;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRequest() {
  return {} as NextRequest;
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function makeInterview() {
  return createInterview({
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
}

describe("DELETE /api/admin/interviews/[id]", () => {
  it("returns 401 when not signed in", async () => {
    isAdminRequestMock.mockResolvedValue(false);
    const response = await DELETE(makeRequest(), makeContext("int_1"));
    expect(response.status).toBe(401);
  });

  it("deletes an interview and child records", async () => {
    isAdminRequestMock.mockResolvedValue(true);
    const interview = await makeInterview();
    await appendInterviewEvents(interview.id, [
      { source: "agent", type: "question", text: "Walk me through it." },
    ]);
    await saveInterviewSummary(interview.id, {
      model: "test",
      evidence: ["Owned API migration"],
      strengths: [],
      risks: [],
      followUpQuestions: [],
    });

    const response = await DELETE(makeRequest(), makeContext(interview.id));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    await expect(getInterview(interview.id)).resolves.toBeUndefined();
    await expect(listInterviewEvents(interview.id)).resolves.toEqual([]);
    await expect(getInterviewSummary(interview.id)).resolves.toBeUndefined();
  });

  it("returns 404 when the interview does not exist", async () => {
    isAdminRequestMock.mockResolvedValue(true);
    const response = await DELETE(makeRequest(), makeContext("missing"));
    expect(response.status).toBe(404);
  });
});
