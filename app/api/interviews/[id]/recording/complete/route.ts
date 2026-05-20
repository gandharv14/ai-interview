import { NextRequest, NextResponse } from "next/server";
import { requireCandidateSession } from "@/lib/server/candidate-session";
import {
  appendInterviewEvents,
  getInterview,
  recordingObjectExists,
  updateInterview,
} from "@/lib/server/store";
import { isValidRecordingPath } from "@/lib/recording";

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

  let body: {
    recordingPath?: unknown;
    contentType?: unknown;
    size?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const recordingPath =
    typeof body.recordingPath === "string" ? body.recordingPath : "";
  if (!isValidRecordingPath(id, recordingPath)) {
    return NextResponse.json(
      { error: "Invalid recording path" },
      { status: 400 },
    );
  }

  if (!(await recordingObjectExists(recordingPath))) {
    return NextResponse.json(
      { error: "Recording file was not found in storage" },
      { status: 404 },
    );
  }

  await updateInterview(id, { recordingPath });
  await appendInterviewEvents(id, [
    {
      source: "system",
      type: "recording_uploaded",
      text: `Recording uploaded (${Math.round(Number(body.size ?? 0) / 1024)}KB).`,
      payload: {
        recordingPath,
        contentType:
          typeof body.contentType === "string" ? body.contentType : undefined,
      },
    },
  ]);

  return NextResponse.json({ recordingPath });
}
