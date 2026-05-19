import { NextRequest, NextResponse } from "next/server";
import { mintRealtimeClientSecret } from "@/lib/server/openai";
import {
  appendInterviewEvents,
  getInterview,
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
  if (interview.status === "completed") {
    return NextResponse.json(
      { error: "Interview is already completed" },
      { status: 409 },
    );
  }

  const updated =
    interview.status === "in_progress"
      ? interview
      : await updateInterview(id, {
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

  const token = await mintRealtimeClientSecret(updated);
  return NextResponse.json(token);
}
