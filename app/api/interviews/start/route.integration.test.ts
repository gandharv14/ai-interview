import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import {
  createInvite,
  getInterview,
  getInviteByTokenHash,
  listInterviews,
  readLocalPrivateFile,
  resumeBucketName,
} from "@/lib/server/store";
import {
  generateInviteToken,
  hashInviteToken,
} from "@/lib/server/security";
import {
  CANDIDATE_SESSION_COOKIE_NAME,
  verifyCandidateSession,
} from "@/lib/server/candidate-session";
import { createPdfFixture } from "@/test/fixtures/pdf";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/interviews/start integration", () => {
  it("starts an interview from a valid PDF resume and persists the upload", async () => {
    process.env.OPENAI_API_KEY = "";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const token = generateInviteToken();
    await createInvite({
      tokenHash: hashInviteToken(token),
      roleTitle: "Backend Engineer",
      level: "L4",
      jobDescription: "APIs and reliability",
      expiresAt: new Date(Date.now() + 100_000).toISOString(),
    });
    const resumeBytes = createPdfFixture([
      "Ada Lovelace",
      "ada@example.com",
      "Built React and Node systems.",
      "Led API migration that reduced latency.",
    ]);
    const formData = new FormData();
    formData.set("token", token);
    formData.set("candidateName", "Ada Lovelace");
    formData.set("candidateEmail", "ada@example.com");
    formData.set("consent", "true");
    formData.set(
      "resume",
      new File([resumeBytes], "ada-resume.pdf", { type: "application/pdf" }),
    );

    const response = await POST({
      formData: async () => formData,
    } as NextRequest);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.parsedResume).toMatchObject({
      candidateName: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(body.parsedResume.skills).toEqual(
      expect.arrayContaining(["React", "Node"]),
    );
    expect(body.interview).toMatchObject({
      candidateName: "Ada Lovelace",
      candidateEmail: "ada@example.com",
      resumeFilename: "ada-resume.pdf",
    });
    expect(body.interview.resumePath).toMatch(
      new RegExp(`^${body.interview.id}/ada-resume\\.pdf$`),
    );

    const interview = await getInterview(body.interview.id);
    expect(interview?.resumePath).toBe(body.interview.resumePath);
    await expect(
      readLocalPrivateFile(resumeBucketName(), body.interview.resumePath),
    ).resolves.toEqual(resumeBytes);
    expect((await getInviteByTokenHash(hashInviteToken(token)))?.status).toBe(
      "used",
    );

    // Cookie is issued, scoped to the interview, and verifies successfully.
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(CANDIDATE_SESSION_COOKIE_NAME);
    expect(setCookie).toContain(`Path=/api/interviews/${body.interview.id}`);
    expect(setCookie).toContain("HttpOnly");
    const cookieValue = (setCookie ?? "")
      .split(";")[0]
      .split("=")
      .slice(1)
      .join("=");
    const verified = verifyCandidateSession(cookieValue, body.interview.id);
    expect(verified.ok).toBe(true);
  });

  it("rolls back to a failed interview and leaves the invite active when upload fails", async () => {
    process.env.OPENAI_API_KEY = "";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const token = generateInviteToken();
    await createInvite({
      tokenHash: hashInviteToken(token),
      roleTitle: "Backend Engineer",
      level: "L4",
      jobDescription: "APIs and reliability",
      expiresAt: new Date(Date.now() + 100_000).toISOString(),
    });

    const storeModule = await import("@/lib/server/store");
    const uploadSpy = vi
      .spyOn(storeModule, "uploadResume")
      .mockRejectedValue(new Error("simulated upload failure"));

    const resumeBytes = createPdfFixture([
      "Grace Hopper",
      "grace@example.com",
      "Built reliability tooling.",
    ]);
    const formData = new FormData();
    formData.set("token", token);
    formData.set("candidateName", "Grace Hopper");
    formData.set("candidateEmail", "grace@example.com");
    formData.set("consent", "true");
    formData.set(
      "resume",
      new File([resumeBytes], "grace.pdf", { type: "application/pdf" }),
    );

    const response = await POST({
      formData: async () => formData,
    } as NextRequest);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("simulated upload failure");
    expect(uploadSpy).toHaveBeenCalled();

    // Invite stays active so the candidate can retry after rotation.
    expect(
      (await getInviteByTokenHash(hashInviteToken(token)))?.status,
    ).toBe("active");

    const interviews = await listInterviews();
    const failed = interviews.find((row) => row.status === "failed");
    expect(failed).toBeDefined();
    expect(failed?.candidateName).toBe("Grace Hopper");
  });
});
