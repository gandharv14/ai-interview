import { describe, expect, it } from "vitest";
import { extractResumeText, parseResumeProfile } from "@/lib/server/resume";
import { createPdfFixture } from "@/test/fixtures/pdf";

describe("resume parsing", () => {
  it("extracts PDF files and builds a local heuristic profile without an API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const file = new File(
      [createPdfFixture([
        "Ada Lovelace",
        "ada@example.com",
        "Built React and Node systems. Led API migration that reduced latency.",
      ])],
      "resume.pdf",
      { type: "application/pdf" },
    );

    const text = await extractResumeText(file);
    const [{ PDFParse }, { getPath: getPdfWorkerPath }] = await Promise.all([
      import("pdf-parse"),
      import("pdf-parse/worker"),
    ]);
    const profile = await parseResumeProfile(text, {
      roleTitle: "Software Engineer",
      level: "L4",
      jobDescription: "",
    });

    expect(PDFParse.setWorker()).toBe(getPdfWorkerPath());
    expect(text).toContain("Ada Lovelace");
    expect(profile.candidateName).toBe("Ada Lovelace");
    expect(profile.email).toBe("ada@example.com");
    expect(profile.skills).toContain("React");
    expect(profile.highSignalClaims[0]).toContain("Led API migration");
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

  it("rejects non-PDF and invalid PDF resume files", async () => {
    await expect(
      extractResumeText(new File(["Ada Lovelace"], "resume.txt", { type: "text/plain" })),
    ).rejects.toThrow("Resume must be a PDF file.");

    await expect(
      extractResumeText(new File(["not a pdf"], "resume.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("Resume must be a valid PDF file.");
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
