import { NextRequest, NextResponse } from "next/server";
import { summarizeInterview } from "@/lib/server/openai";
import { requireCandidateSession } from "@/lib/server/candidate-session";
import {
  appendInterviewEvents,
  getInterview,
  getInterviewSummary,
  listInterviewEvents,
  saveInterviewSummary,
  updateInterview,
} from "@/lib/server/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const unauthorized = await requireCandidateSession(request, id);
  if (unauthorized) return unauthorized;

  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  // Idempotent: if already completed, return the existing record + summary
  // without re-running the LLM or appending new events.
  if (interview.status === "completed") {
    const existing = await getInterviewSummary(id);
    return NextResponse.json({ interview, summary: existing });
  }

  const events = await listInterviewEvents(id);
  const existing = await getInterviewSummary(id);
  const transcriptPath = events
    .map((event) => event.payload)
    .map((payload) =>
      typeof payload === "object" && payload !== null && "transcriptPath" in payload
        ? (payload as { transcriptPath?: string }).transcriptPath
        : undefined,
    )
    .find(Boolean);

  let summary = existing;
  if (!summary) {
    try {
      const generated = await summarizeInterview(interview, events);
      summary = await saveInterviewSummary(id, {
        ...generated,
        transcriptPath,
      });
    } catch (error) {
      console.error("/api/interviews/[id]/complete summary failed", error);
      summary = await saveInterviewSummary(id, {
        model: "summary-failed",
        evidence: [],
        strengths: [],
        risks: [
          `Summary generation failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
        followUpQuestions: [],
        transcriptPath,
      });
    }
  }

  const updated = await updateInterview(id, {
    status: "completed",
    completedAt: new Date().toISOString(),
  });
  await appendInterviewEvents(id, [
    {
      source: "system",
      type: "interview_completed",
      text: "Interview completed and summary generated.",
    },
  ]);

  return NextResponse.json({ interview: updated, summary });
}
