import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { interviewEventBatchSchema } from "@/lib/schemas";
import { requireCandidateSession } from "@/lib/server/candidate-session";
import {
  appendInterviewEvents,
  getInterview,
  listInterviewEvents,
} from "@/lib/server/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const unauthorized = await requireCandidateSession(request, id);
  if (unauthorized) return unauthorized;

  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }
  const events = await listInterviewEvents(id);
  return NextResponse.json({ events });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const unauthorized = await requireCandidateSession(request, id);
  if (unauthorized) return unauthorized;

  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  let events;
  try {
    events = interviewEventBatchSchema.parse(body).events;
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid event payload",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    throw error;
  }

  const saved = await appendInterviewEvents(id, events);
  return NextResponse.json({ events: saved });
}
