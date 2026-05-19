import { describe, expect, it, vi } from "vitest";
import { mintRealtimeClientSecret } from "@/lib/server/openai";
import type { Interview } from "@/lib/types";

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
      phone: undefined,
      headline: "Distributed systems engineer",
      skills: ["TypeScript", "Postgres"],
      experience: [
        {
          company: "Acme",
          title: "Staff Engineer",
          startDate: "2021-01",
          endDate: undefined,
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

describe("mintRealtimeClientSecret", () => {
  it("requests a gpt-realtime-2 session with the parsed resume in instructions", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.OPENAI_REALTIME_MODEL;

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
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("fails fast when no OPENAI_API_KEY is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(
      mintRealtimeClientSecret(buildInterviewFixture()),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
