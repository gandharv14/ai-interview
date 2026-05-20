import { describe, expect, it } from "vitest";
import { buildRealtimeInstructions } from "@/lib/server/prompt";

describe("realtime prompt", () => {
  it("anchors the interview in resume claims and one-question-at-a-time guidance", () => {
    const prompt = buildRealtimeInstructions(
      {
        candidateName: "Ada",
        roleTitle: "Software Engineer",
        level: "L4",
        jobDescription: "Backend systems",
      },
      {
        headline: "Built distributed systems",
        skills: ["TypeScript", "Postgres"],
        experience: [],
        projects: [
          {
            name: "API Migration",
            description: "Moved a monolith API into services",
            technologies: ["Node", "Postgres"],
            impact: "Reduced latency",
          },
        ],
        education: [],
        highSignalClaims: ["Led API migration"],
      },
    );

    expect(prompt).toContain("Ada");
    expect(prompt).toContain("API Migration");
    expect(prompt).toContain("Resume SWE Interviewer behavior");
    expect(prompt).toContain("The candidate should do most of the talking");
    expect(prompt).toContain("Ask one question at a time");
    expect(prompt).toContain("hard 20-minute limit");
    expect(prompt).toContain("Led API migration");
  });
});
