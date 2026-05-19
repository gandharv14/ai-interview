import { NextRequest, NextResponse } from "next/server";
import { interviewEventBatchSchema } from "@/lib/schemas";
import { appendInterviewEvents, getInterview } from "@/lib/server/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  const body = await request.json();
  const { events } = interviewEventBatchSchema.parse(body);
  const saved = await appendInterviewEvents(id, events);
  return NextResponse.json({ events: saved });
}
