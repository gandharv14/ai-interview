import { afterEach, describe, expect, it, vi } from "vitest";

const supabaseAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/supabase", () => ({
  getSupabaseAdmin: supabaseAdminMock,
  assertServiceRoleKey: vi.fn(),
}));

import {
  appendInterviewEvents,
  createInterview,
  createInvite,
  deleteInterview,
  getInterview,
  getInviteByTokenHash,
  getInterviewSummary,
  listInterviews,
  listInterviewEvents,
  saveInterviewSummary,
  StoreSetupError,
  updateInterview,
} from "@/lib/server/store";

describe("local store fallback", () => {
  it("persists invites, interviews, events, and summaries", async () => {
    const invite = await createInvite({
      tokenHash: "abc",
      roleTitle: "Backend Engineer",
      level: "L4",
      jobDescription: "APIs",
      expiresAt: new Date(Date.now() + 100_000).toISOString(),
    });

    expect((await getInviteByTokenHash("abc"))?.id).toBe(invite.id);

    const interview = await createInterview({
      inviteId: invite.id,
      candidateName: "Ada",
      roleTitle: invite.roleTitle,
      level: invite.level,
      jobDescription: invite.jobDescription,
      parsedResume: {
        headline: "Backend engineer",
        skills: ["Node"],
        experience: [],
        projects: [],
        education: [],
        highSignalClaims: [],
      },
    });

    await updateInterview(interview.id, { status: "in_progress" });
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

    const events = await listInterviewEvents(interview.id);
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe("Walk me through it.");
  });

  it("deletes interviews and their local child records", async () => {
    const interview = await createInterview({
      candidateName: "Grace",
      roleTitle: "Backend Engineer",
      level: "L5",
      jobDescription: "APIs",
      parsedResume: {
        headline: "Backend engineer",
        skills: ["Go"],
        experience: [],
        projects: [],
        education: [],
        highSignalClaims: [],
      },
    });

    await appendInterviewEvents(interview.id, [
      { source: "agent", type: "question", text: "Tell me about scale." },
    ]);
    await saveInterviewSummary(interview.id, {
      model: "test",
      evidence: ["Scaled APIs"],
      strengths: [],
      risks: [],
      followUpQuestions: [],
    });

    await expect(deleteInterview(interview.id)).resolves.toBe(true);
    await expect(deleteInterview(interview.id)).resolves.toBe(false);
    await expect(getInterview(interview.id)).resolves.toBeUndefined();
    await expect(listInterviewEvents(interview.id)).resolves.toEqual([]);
    await expect(getInterviewSummary(interview.id)).resolves.toBeUndefined();
  });
});

describe("appendInterviewEvents (Supabase path)", () => {
  afterEach(() => {
    supabaseAdminMock.mockReset();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("omits created_at when the caller does not provide one", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    const insertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const fromSpy = vi.fn().mockReturnValue({ insert: insertSpy });
    supabaseAdminMock.mockReturnValue({ from: fromSpy });

    const providedAt = new Date("2026-05-01T12:00:00.000Z").toISOString();
    await appendInterviewEvents("int_1", [
      { source: "system", type: "resume_parsed", text: "ok" },
      {
        source: "agent",
        type: "question",
        text: "explain",
        createdAt: providedAt,
      },
    ]);

    expect(fromSpy).toHaveBeenCalledWith("interview_events");
    const rows = insertSpy.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toHaveProperty("created_at");
    expect(rows[1]).toMatchObject({ created_at: providedAt });
  });
});

describe("store setup errors", () => {
  afterEach(() => {
    supabaseAdminMock.mockReset();
    delete process.env.NODE_ENV;
    delete process.env.VERCEL;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("throws a typed setup error when production has no Supabase config", async () => {
    process.env.NODE_ENV = "production";

    await expect(listInterviews()).rejects.toMatchObject({
      name: "StoreSetupError",
      reason: "missing_supabase_config",
      message: "Supabase env vars are required in production",
    });
  });

  it("wraps invalid Supabase client configuration as a setup error", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "not-a-service-role-key";
    supabaseAdminMock.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not a valid JWT.");
    });

    await expect(listInterviews()).rejects.toBeInstanceOf(StoreSetupError);
    await expect(listInterviews()).rejects.toMatchObject({
      reason: "invalid_supabase_config",
      message: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
    });
  });
});
