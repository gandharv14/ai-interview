import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const isAdminRequestMock = vi.fn();
const getAdminAccessStatusMock = vi.fn();

vi.mock("@/lib/server/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/admin")>(
    "@/lib/server/admin",
  );
  return {
    ...actual,
    getAdminAccessStatus: (...args: unknown[]) =>
      getAdminAccessStatusMock(...args),
    isAdminRequest: (...args: unknown[]) => isAdminRequestMock(...args),
  };
});

import { DELETE, PATCH } from "./route";
import {
  appendInterviewEvents,
  createInterview,
  getInterview,
  getInterviewSummary,
  listInterviewEvents,
  saveInterviewSummary,
  updateInterview,
} from "@/lib/server/store";

beforeEach(() => {
  isAdminRequestMock.mockReset();
  getAdminAccessStatusMock.mockReset();
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

function makeJsonRequest(body: unknown) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
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

describe("PATCH /api/admin/interviews/[id]", () => {
  it("returns 401 when not signed in", async () => {
    getAdminAccessStatusMock.mockResolvedValue({ status: "unauthenticated" });
    const response = await PATCH(
      makeJsonRequest({ action: "reserve" }),
      makeContext("int_1"),
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid review actions", async () => {
    getAdminAccessStatusMock.mockResolvedValue({
      status: "authorized",
      email: "reviewer@example.com",
    });
    const interview = await makeCompletedInterview();

    const response = await PATCH(
      makeJsonRequest({ action: "decision", decision: "maybe" }),
      makeContext(interview.id),
    );

    expect(response.status).toBe(400);
  });

  it("reserves a completed interview for the signed-in reviewer", async () => {
    getAdminAccessStatusMock.mockResolvedValue({
      status: "authorized",
      email: "Reviewer@Example.com",
    });
    const interview = await makeCompletedInterview();

    const response = await PATCH(
      makeJsonRequest({ action: "reserve" }),
      makeContext(interview.id),
    );
    const body = (await response.json()) as {
      interview: { reservedByEmail?: string };
    };

    expect(response.status).toBe(200);
    expect(body.interview.reservedByEmail).toBe("reviewer@example.com");
  });

  it("returns 409 when another reviewer has an active reservation", async () => {
    const interview = await makeCompletedInterview();
    await updateInterview(interview.id, {
      reservedByEmail: "owner@example.com",
      reservedAt: new Date().toISOString(),
    });
    getAdminAccessStatusMock.mockResolvedValue({
      status: "authorized",
      email: "other@example.com",
    });

    const response = await PATCH(
      makeJsonRequest({ action: "reserve" }),
      makeContext(interview.id),
    );
    const body = (await response.json()) as { reason?: string };

    expect(response.status).toBe(409);
    expect(body.reason).toBe("already_reserved");
  });

  it("submits a pass/fail decision for the reserving reviewer", async () => {
    const interview = await makeCompletedInterview();
    await updateInterview(interview.id, {
      reservedByEmail: "owner@example.com",
      reservedAt: new Date().toISOString(),
    });
    getAdminAccessStatusMock.mockResolvedValue({
      status: "authorized",
      email: "owner@example.com",
    });

    const response = await PATCH(
      makeJsonRequest({ action: "decision", decision: "pass" }),
      makeContext(interview.id),
    );
    const body = (await response.json()) as {
      interview: { reviewDecision?: string; reviewedByEmail?: string };
    };

    expect(response.status).toBe(200);
    expect(body.interview.reviewDecision).toBe("pass");
    expect(body.interview.reviewedByEmail).toBe("owner@example.com");
  });
});

async function makeCompletedInterview() {
  const interview = await makeInterview();
  return updateInterview(interview.id, {
    status: "completed",
    completedAt: new Date().toISOString(),
  });
}
