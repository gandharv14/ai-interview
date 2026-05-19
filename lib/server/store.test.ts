import { describe, expect, it } from "vitest";
import {
  appendInterviewEvents,
  createInterview,
  createInvite,
  getInviteByTokenHash,
  listInterviewEvents,
  saveInterviewSummary,
  updateInterview,
} from "@/lib/server/store";

describe("local store fallback", () => {
  it("persists invites, interviews, events, and summaries", async () => {
    const invite = await createInvite({
      tokenHash: "abc",
      roleTitle: "Backend Engineer",
      level: "L4",
      jobDescription: "APIs",
      expiresAt: new Date(Date.now() + 100_000).toISOString(),
    });

    expect((await getInviteByTokenHash("abc"))?.id).toBe(invite.id);

    const interview = await createInterview({
      inviteId: invite.id,
      candidateName: "Ada",
      roleTitle: invite.roleTitle,
      level: invite.level,
      jobDescription: invite.jobDescription,
      parsedResume: {
        headline: "Backend engineer",
        skills: ["Node"],
        experience: [],
        projects: [],
        education: [],
        highSignalClaims: [],
      },
    });

    await updateInterview(interview.id, { status: "in_progress" });
    await appendInterviewEvents(interview.id, [
      { source: "agent", type: "question", text: "Walk me through it." },
    ]);
    await saveInterviewSummary(interview.id, {
      model: "test",
      evidence: ["Owned API migration"],
      strengths: [],
      risks: [],
      followUpQuestions: [],
    });

    const events = await listInterviewEvents(interview.id);
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe("Walk me through it.");
  });
});
