import { NextRequest, NextResponse } from "next/server";
import { mintRealtimeClientSecret } from "@/lib/server/openai";
import { requireCandidateSession } from "@/lib/server/candidate-session";
import {
  appendInterviewEvents,
  getInterview,
  listInterviewEvents,
  updateInterview,
} from "@/lib/server/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_REALTIME_RESUME_EVENTS = 10;

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const unauthorized = await requireCandidateSession(request, id);
  if (unauthorized) return unauthorized;

  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }
  if (interview.status === "completed") {
    return NextResponse.json(
      { error: "Interview is already completed" },
      { status: 409 },
    );
  }
  if (interview.status === "failed") {
    return NextResponse.json(
      { error: "Interview is in a failed state" },
      { status: 409 },
    );
  }

  // Mint the OpenAI client_secret first so we don't mutate state on failure.
  const token = await mintRealtimeClientSecret(interview);

  if (interview.status === "ready") {
    const updated = await updateInterview(id, {
      status: "in_progress",
      startedAt: new Date().toISOString(),
    });
    await appendInterviewEvents(id, [
      {
        source: "system",
        type: "realtime_started",
        text: "Realtime voice session started.",
      },
    ]);
    return NextResponse.json({ ...token, interview: updated });
  }

  // Already in_progress - log a resume event but cap the count.
  const events = await listInterviewEvents(id);
  const resumeCount = events.filter(
    (event) => event.type === "realtime_resumed",
  ).length;
  if (resumeCount < MAX_REALTIME_RESUME_EVENTS) {
    await appendInterviewEvents(id, [
      {
        source: "system",
        type: "realtime_resumed",
        text: "Realtime voice session resumed.",
      },
    ]);
  }
  return NextResponse.json({ ...token, interview });
}
