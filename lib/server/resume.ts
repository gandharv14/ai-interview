import "server-only";

import { getOptionalEnv, getTextModel } from "@/lib/server/env";
import {
  parsedResumeJsonSchema,
  parsedResumeSchema,
} from "@/lib/schemas";
import type { ParsedResume } from "@/lib/types";

const MAX_RESUME_CHARS = 90_000;
const PDF_MIME_TYPE = "application/pdf";

export class ResumeFileError extends Error {}

export function isPdfResumeFile(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return name.endsWith(".pdf") && (!type || type === PDF_MIME_TYPE);
}

export async function extractResumeText(file: File) {
  if (!isPdfResumeFile(file)) {
    throw new ResumeFileError("Resume must be a PDF file.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new ResumeFileError("Resume must be a valid PDF file.");
  }

  await installPdfRuntimeGlobals();
  const [{ PDFParse }, { getPath: getPdfWorkerPath }] = await Promise.all([
    import("pdf-parse"),
    import("pdf-parse/worker"),
  ]);
  PDFParse.setWorker(getPdfWorkerPath());
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText({
      cellSeparator: " ",
      pageJoiner: "",
    });
    const text = normalizeText(parsed.text);
    if (!text) {
      throw new ResumeFileError(
        "Resume PDF did not contain extractable text. Upload a text-based PDF resume.",
      );
    }
    return text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function installPdfRuntimeGlobals() {
  if (globalThis.DOMMatrix && globalThis.ImageData && globalThis.Path2D) return;

  const canvas = await import("@napi-rs/canvas");
  globalThis.DOMMatrix ??= canvas.DOMMatrix as unknown as typeof DOMMatrix;
  globalThis.ImageData ??= canvas.ImageData as unknown as typeof ImageData;
  globalThis.Path2D ??= canvas.Path2D as unknown as typeof Path2D;
}

export async function parseResumeProfile(
  resumeText: string,
  roleContext: { roleTitle: string; level: string; jobDescription: string },
): Promise<ParsedResume> {
  const apiKey = getOptionalEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return heuristicResumeProfile(resumeText);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getTextModel(),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Extract structured software engineering interview context from a resume. Focus on projects, ownership claims, technical depth, skills, and measurable impact.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Target role: ${roleContext.roleTitle}, ${roleContext.level}\nJob description:\n${roleContext.jobDescription || "General software engineering role."}\n\nResume text:\n${resumeText.slice(0, MAX_RESUME_CHARS)}`,
            },
          ],
        },
      ],
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "resume_profile",
          strict: true,
          schema: parsedResumeJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resume parsing failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as unknown;
  const text = extractResponseText(data);
  const parsed = JSON.parse(text);
  return parsedResumeSchema.parse(parsed);
}

function normalizeText(text: string) {
  return text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").trim();
}

function extractResponseText(data: unknown): string {
  if (typeof data === "object" && data !== null && "output_text" in data) {
    const outputText = (data as { output_text?: unknown }).output_text;
    if (typeof outputText === "string") return outputText;
  }

  const output = (data as { output?: unknown }).output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") return text;
      }
    }
  }

  throw new Error("OpenAI response did not include output text");
}

function heuristicResumeProfile(text: string): ParsedResume {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0];
  const candidateName = lines[0]?.slice(0, 80);
  const keywords = [
    "TypeScript",
    "JavaScript",
    "React",
    "Node",
    "Python",
    "Go",
    "Java",
    "AWS",
    "GCP",
    "Kubernetes",
    "Postgres",
    "Redis",
    "GraphQL",
    "Machine Learning",
    "LLM",
    "Distributed Systems",
  ];
  const skills = keywords.filter((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase()),
  );
  const highSignalClaims = lines
    .filter((line) =>
      /\b(led|owned|architected|built|scaled|migrated|launched|reduced|improved|increased|latency|reliability|cost)\b/i.test(
        line,
      ),
    )
    .slice(0, 8);

  return {
    candidateName,
    email,
    phone,
    headline: lines.slice(1, 4).join(" ") || "Software engineering candidate",
    skills,
    experience: [],
    projects: highSignalClaims.slice(0, 4).map((claim, index) => ({
      name: `Resume claim ${index + 1}`,
      description: claim,
      technologies: skills.slice(0, 5),
    })),
    education: lines
      .filter((line) => /\b(university|college|b\.s\.|m\.s\.|phd|degree)\b/i.test(line))
      .slice(0, 3),
    highSignalClaims,
  };
}
