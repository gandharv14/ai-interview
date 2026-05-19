import { describe, expect, it } from "vitest";
import { extractResumeText, parseResumeProfile } from "@/lib/server/resume";

describe("resume parsing", () => {
  it("extracts text files and builds a local heuristic profile without an API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const file = new File(
      [
        "Ada Lovelace\nada@example.com\nBuilt React and Node systems. Led API migration that reduced latency.",
      ],
      "resume.txt",
      { type: "text/plain" },
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
});
