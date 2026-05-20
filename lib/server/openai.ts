import "server-only";

import OpenAI, { toFile } from "openai";
import {
  getOptionalEnv,
  getRealtimeModel,
  getRealtimeTranscribeModel,
  getTextModel,
  getTranscribeModel,
} from "@/lib/server/env";
import { buildRealtimeInstructions, buildSummaryPrompt } from "@/lib/server/prompt";
import { summaryJsonSchema, summarySchema } from "@/lib/schemas";
import type { Interview, InterviewEvent, InterviewSummary } from "@/lib/types";

const MAX_DIARIZED_TRANSCRIPTION_BYTES = 24 * 1024 * 1024;

export async function mintRealtimeClientSecret(interview: Interview) {
  const apiKey = getOptionalEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for live realtime interviews");
  }

  const response = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: 120,
        },
        session: {
          type: "realtime",
          model: getRealtimeModel(),
          instructions: buildRealtimeInstructions(
            {
              candidateName: interview.candidateName,
              roleTitle: interview.roleTitle,
              level: interview.level,
              jobDescription: interview.jobDescription,
            },
            interview.parsedResume,
          ),
          audio: {
            input: {
              transcription: {
                model: getRealtimeTranscribeModel(),
              },
              turn_detection: {
                type: "semantic_vad",
              },
            },
            output: {
              voice: "marin",
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Realtime token failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    client_secret?: { value?: string; expires_at?: number };
    value?: string;
    expires_at?: number;
  };

  const value = data.client_secret?.value ?? data.value;
  if (!value) throw new Error("Realtime token response missing client secret");

  return {
    clientSecret: value,
    expiresAt: data.client_secret?.expires_at ?? data.expires_at,
    model: getRealtimeModel(),
  };
}

const MAX_RESUME_PROMPT_CHARS = 30_000;
const MAX_TRANSCRIPT_PROMPT_CHARS = 60_000;

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[...truncated, ${text.length - max} chars omitted]`;
}

export async function summarizeInterview(
  interview: Interview,
  events: InterviewEvent[],
): Promise<Omit<InterviewSummary, "id" | "interviewId" | "createdAt">> {
  const apiKey = getOptionalEnv("OPENAI_API_KEY");
  const transcript = truncate(
    events
      .filter((event) => event.text)
      .map((event) => `[${event.source}] ${event.text}`)
      .join("\n"),
    MAX_TRANSCRIPT_PROMPT_CHARS,
  );

  if (!apiKey) {
    return {
      model: "local-heuristic",
      evidence: transcript ? [transcript.slice(0, 800)] : [],
      strengths: [],
      risks: ["No OpenAI API key was configured; summary is a placeholder."],
      followUpQuestions: interview.parsedResume.highSignalClaims
        .slice(0, 3)
        .map((claim) => `Probe ownership and implementation detail for: ${claim}`),
    };
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
              text: "You summarize software engineering interview evidence for reviewers. Do not make a hire/no-hire recommendation.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildSummaryPrompt(interview, transcript, {
                resumeMaxChars: MAX_RESUME_PROMPT_CHARS,
                transcriptMaxChars: MAX_TRANSCRIPT_PROMPT_CHARS,
              }),
            },
          ],
        },
      ],
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "interview_summary",
          strict: true,
          schema: summaryJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Summary generation failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as unknown;
  const text = extractResponseText(data);
  const parsed = summarySchema.parse(JSON.parse(text));
  return {
    model: getTextModel(),
    evidence: parsed.evidence,
    strengths: parsed.strengths,
    risks: parsed.risks,
    followUpQuestions: parsed.followUpQuestions,
  };
}

export async function transcribeRecordingIfSmall(file: File) {
  const apiKey = getOptionalEnv("OPENAI_API_KEY");
  if (!apiKey || file.size > MAX_DIARIZED_TRANSCRIPTION_BYTES) return undefined;

  const client = new OpenAI({ apiKey });
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await toFile(buffer, file.name || "interview.webm", {
    type: file.type || "audio/webm",
  });
  const model = getTranscribeModel();
  const isDiarize = /diarize/i.test(model);
  const transcription = await client.audio.transcriptions.create({
    file: upload,
    model,
    response_format: isDiarize
      ? ("diarized_json" as unknown as "json")
      : "json",
  });

  return JSON.stringify(transcription, null, 2);
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
