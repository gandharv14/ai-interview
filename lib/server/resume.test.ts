import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractResumeText, parseResumeProfile } from "@/lib/server/resume";
import { parsedResumeJsonSchema } from "@/lib/schemas";
import {
  createMultiPagePdfFixture,
  createPdfFixture,
} from "@/test/fixtures/pdf";

beforeEach(() => {
  delete process.env.NODE_ENV;
  delete process.env.VERCEL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resume parsing", () => {
  it("extracts PDF files and builds a local heuristic profile without an API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const file = new File(
      [createPdfFixture([
        "Ada Lovelace",
        "Senior Software Engineer building distributed systems.",
        "ada@example.com",
        "Built React and Node systems. Led API migration that reduced latency.",
      ])],
      "resume.pdf",
      { type: "application/pdf" },
    );

    const text = await extractResumeText(file);
    const profile = await parseResumeProfile(text, {
      roleTitle: "Software Engineer",
      level: "L4",
      jobDescription: "",
    });

    expect(text).toContain("Ada Lovelace");
    expect(profile.candidateName).toBe("Ada Lovelace");
    expect(profile.email).toBe("ada@example.com");
    expect(profile.skills).toContain("React");
    expect(profile.highSignalClaims[0]).toContain("Led API migration");
    // Headline should not be the email line.
    expect(profile.headline).not.toContain("@");
  });

  it("separates pages with a blank line in extracted text", async () => {
    const file = new File(
      [
        createMultiPagePdfFixture([
          ["Page one heading", "Body paragraph for page one."],
          ["Page two heading", "Body paragraph for page two."],
        ]),
      ],
      "resume.pdf",
      { type: "application/pdf" },
    );

    const text = await extractResumeText(file);
    expect(text).toContain("Page one heading");
    expect(text).toContain("Page two heading");
    // Pages must be separated by at least one newline so words don't glue.
    expect(text).toMatch(/page one\.\s+Page two heading/i);
  });

  it("installs PDF runtime globals when Node does not provide DOMMatrix", async () => {
    const originalDOMMatrix = globalThis.DOMMatrix;
    const originalImageData = globalThis.ImageData;
    const originalPath2D = globalThis.Path2D;
    Reflect.deleteProperty(globalThis, "DOMMatrix");
    Reflect.deleteProperty(globalThis, "ImageData");
    Reflect.deleteProperty(globalThis, "Path2D");

    try {
      const file = new File(
        [createPdfFixture(["Grace Hopper", "Built TypeScript systems."])],
        "resume.pdf",
        { type: "application/pdf" },
      );

      await expect(extractResumeText(file)).resolves.toContain("Grace Hopper");
      expect(globalThis.DOMMatrix).toBeDefined();
      expect(globalThis.ImageData).toBeDefined();
      expect(globalThis.Path2D).toBeDefined();
    } finally {
      restoreGlobal("DOMMatrix", originalDOMMatrix);
      restoreGlobal("ImageData", originalImageData);
      restoreGlobal("Path2D", originalPath2D);
    }
  });

  it("calls GPT-5.5 with a strict-mode schema and tolerates nullable resume fields", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.OPENAI_TEXT_MODEL;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              candidateName: "Grace Hopper",
              email: null,
              phone: null,
              headline: "Distributed systems engineer",
              skills: ["TypeScript", "Postgres"],
              experience: [
                {
                  company: "Acme",
                  title: "Staff Engineer",
                  startDate: null,
                  endDate: null,
                  highlights: ["Owned API migration"],
                },
              ],
              projects: [
                {
                  name: "Cluster ledger",
                  description: "Sharded ledger for analytics",
                  technologies: ["Go", "Postgres"],
                  impact: null,
                },
              ],
              education: ["BS Computer Science"],
              highSignalClaims: ["Owned API migration"],
            }),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    try {
      const profile = await parseResumeProfile("Resume text", {
        roleTitle: "Senior Backend Engineer",
        level: "L5",
        jobDescription: "Distributed systems",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/responses");
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.model).toBe("gpt-5.5");
      expect(body.text.format).toMatchObject({
        type: "json_schema",
        name: "resume_profile",
        strict: true,
      });
      expect(body.text.format.schema).toEqual(parsedResumeJsonSchema);

      expect(profile.candidateName).toBe("Grace Hopper");
      expect(profile.email).toBeUndefined();
      expect(profile.phone).toBeUndefined();
      expect(profile.experience[0]?.startDate).toBeUndefined();
      expect(profile.projects[0]?.impact).toBeUndefined();
      expect(profile.highSignalClaims).toContain("Owned API migration");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects non-PDF and invalid PDF resume files", async () => {
    await expect(
      extractResumeText(new File(["Ada Lovelace"], "resume.txt", { type: "text/plain" })),
    ).rejects.toThrow("Resume must be a PDF file.");

    await expect(
      extractResumeText(new File(["not a pdf"], "resume.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("Resume must be a valid PDF file.");
  });

  it("fails closed in production when OPENAI_API_KEY is missing", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.OPENAI_API_KEY;

    await expect(
      parseResumeProfile("Some resume text", {
        roleTitle: "Engineer",
        level: "L4",
        jobDescription: "",
      }),
    ).rejects.toThrow(/OPENAI_API_KEY in production/);
  });
});

function restoreGlobal<T extends keyof typeof globalThis>(
  key: T,
  value: (typeof globalThis)[T],
) {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, key);
    return;
  }
  globalThis[key] = value;
}
