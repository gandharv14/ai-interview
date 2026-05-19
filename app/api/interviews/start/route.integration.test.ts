import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "./route";
import {
  createInvite,
  getInterview,
  getInviteByTokenHash,
  readLocalPrivateFile,
  resumeBucketName,
} from "@/lib/server/store";
import {
  generateInviteToken,
  hashInviteToken,
} from "@/lib/server/security";
import { createPdfFixture } from "@/test/fixtures/pdf";

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
  });
});
