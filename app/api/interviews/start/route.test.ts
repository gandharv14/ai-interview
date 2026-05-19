import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/resume", () => ({
  ResumeFileError: class ResumeFileError extends Error {},
  extractResumeText: vi.fn(async () => "Ada Lovelace\nBuilt API systems."),
  isPdfResumeFile: vi.fn(
    (file: File) =>
      file.name.toLowerCase().endsWith(".pdf") &&
      (!file.type || file.type === "application/pdf"),
  ),
  parseResumeProfile: vi.fn(async () => {
    throw new Error("Resume parsing failed: upstream unavailable");
  }),
}));

import type { NextRequest } from "next/server";
import { POST } from "./route";
import { createInvite } from "@/lib/server/store";
import {
  generateInviteToken,
  hashInviteToken,
} from "@/lib/server/security";

describe("POST /api/interviews/start", () => {
  it("returns JSON when resume parsing fails", async () => {
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

    const formData = new FormData();
    formData.set("token", token);
    formData.set("candidateName", "Ada Lovelace");
    formData.set("candidateEmail", "ada@example.com");
    formData.set("consent", "true");
    formData.set(
      "resume",
      new File(["%PDF-1.4\nAda Lovelace\nBuilt API systems."], "resume.pdf", {
        type: "application/pdf",
      }),
    );

    const response = await POST({
      formData: async () => formData,
    } as NextRequest);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Resume parsing failed"),
    });
  });

  it("returns JSON for invalid upload form submissions", async () => {
    const formData = new FormData();

    const response = await POST({
      formData: async () => formData,
    } as NextRequest);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Check the resume upload form and try again.",
    });
  });

  it("rejects non-PDF resume uploads", async () => {
    const formData = new FormData();
    formData.set("token", generateInviteToken());
    formData.set("consent", "true");
    formData.set(
      "resume",
      new File(["Ada Lovelace"], "resume.txt", { type: "text/plain" }),
    );

    const response = await POST({
      formData: async () => formData,
    } as NextRequest);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Resume must be a PDF file.",
    });
  });
});
