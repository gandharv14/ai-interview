import { NextRequest, NextResponse } from "next/server";
import { summarizeInterview } from "@/lib/server/openai";
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

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
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

  const summary =
    existing ??
    (await saveInterviewSummary(id, {
      ...(await summarizeInterview(interview, events)),
      transcriptPath,
    }));

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
