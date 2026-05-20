import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mintRealtimeClientSecret,
  transcribeRecordingIfSmall,
} from "@/lib/server/openai";
import type { Interview } from "@/lib/types";

const transcriptionsCreate = vi.fn();

vi.mock("openai", async () => {
  const actual = await vi.importActual<typeof import("openai")>("openai");
  class FakeOpenAI {
    audio = {
      transcriptions: {
        create: (...args: unknown[]) => transcriptionsCreate(...args),
      },
    };
  }
  return {
    ...actual,
    default: FakeOpenAI,
    toFile: actual.toFile,
  };
});

function buildInterviewFixture(): Interview {
  const now = new Date().toISOString();
  return {
    id: "int_test",
    inviteId: "inv_test",
    candidateName: "Ada Lovelace",
    candidateEmail: "ada@example.com",
    roleTitle: "Senior Backend Engineer",
    level: "L5",
    jobDescription: "Distributed systems and reliability",
    status: "ready",
    parsedResume: {
      candidateName: "Ada Lovelace",
      email: "ada@example.com",
      headline: "Distributed systems engineer",
      skills: ["TypeScript", "Postgres"],
      experience: [
        {
          company: "Acme",
          title: "Staff Engineer",
          startDate: "2021-01",
          highlights: ["Owned API migration"],
        },
      ],
      projects: [
        {
          name: "Cluster ledger",
          description: "Sharded ledger for analytics",
          technologies: ["Go", "Postgres"],
          impact: "Cut p95 latency in half",
        },
      ],
      education: ["BS Computer Science"],
      highSignalClaims: ["Owned API migration end-to-end"],
    },
    createdAt: now,
    updatedAt: now,
  };
}

afterEach(() => {
  transcriptionsCreate.mockReset();
});

describe("mintRealtimeClientSecret", () => {
  it("requests a gpt-realtime-2 session with the parsed resume in instructions", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.OPENAI_REALTIME_MODEL;
    delete process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          value: "rt_secret_value",
          expires_at: Math.floor(Date.now() / 1000) + 120,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    try {
      const token = await mintRealtimeClientSecret(buildInterviewFixture());

      expect(token).toMatchObject({
        clientSecret: "rt_secret_value",
        model: "gpt-realtime-2",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.session.model).toBe("gpt-realtime-2");
      expect(body.session.instructions).toContain("Ada Lovelace");
      expect(body.session.instructions).toContain("Cluster ledger");
      expect(body.session.instructions).toContain("Owned API migration end-to-end");
      expect(body.session.audio.input.transcription.model).toBe(
        "gpt-realtime-whisper",
      );
      // We dropped reasoning from the realtime payload; ensure it isn't present.
      expect(body.session.reasoning).toBeUndefined();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("uses OPENAI_REALTIME_TRANSCRIBE_MODEL when set", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL = "custom-transcribe";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ value: "rt", expires_at: 0 }),
        { status: 200 },
      ),
    );
    try {
      await mintRealtimeClientSecret(buildInterviewFixture());
      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.session.audio.input.transcription.model).toBe(
        "custom-transcribe",
      );
    } finally {
      fetchMock.mockRestore();
      delete process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL;
    }
  });

  it("fails fast when no OPENAI_API_KEY is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(
      mintRealtimeClientSecret(buildInterviewFixture()),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });
});

describe("transcribeRecordingIfSmall", () => {
  it("uses diarized_json when the model name contains diarize", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_TRANSCRIBE_MODEL = "gpt-4o-transcribe-diarize";
    transcriptionsCreate.mockResolvedValue({ text: "hello" });

    const file = new File([new Uint8Array(64)], "rec.webm", {
      type: "audio/webm",
    });
    const result = await transcribeRecordingIfSmall(file);
    expect(result).toBeDefined();
    expect(transcriptionsCreate).toHaveBeenCalledTimes(1);
    const [args] = transcriptionsCreate.mock.calls[0];
    expect(args).toMatchObject({
      model: "gpt-4o-transcribe-diarize",
      response_format: "diarized_json",
    });
  });

  it("uses json for non-diarize models", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_TRANSCRIBE_MODEL = "gpt-4o-transcribe";
    transcriptionsCreate.mockResolvedValue({ text: "hello" });

    const file = new File([new Uint8Array(64)], "rec.webm", {
      type: "audio/webm",
    });
    await transcribeRecordingIfSmall(file);
    const [args] = transcriptionsCreate.mock.calls[0];
    expect(args).toMatchObject({
      model: "gpt-4o-transcribe",
      response_format: "json",
    });
  });

  it("returns undefined without an API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const file = new File([new Uint8Array(64)], "rec.webm", {
      type: "audio/webm",
    });
    await expect(transcribeRecordingIfSmall(file)).resolves.toBeUndefined();
  });
});
