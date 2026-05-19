import { describe, expect, it } from "vitest";
import { extractResumeText, parseResumeProfile } from "@/lib/server/resume";

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

function createPdfFixture(lines: string[]) {
  const escapedText = lines
    .join("\n")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\n/g, ") Tj T* (");
  const stream = `BT /F1 12 Tf 14 TL 72 720 Td (${escapedText}) Tj ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(stream, "latin1")} >> stream\n${stream}\nendstream endobj`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

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
