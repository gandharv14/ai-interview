import { NextRequest, NextResponse } from "next/server";
import { requireCandidateSession } from "@/lib/server/candidate-session";
import {
  createSignedRecordingUploadUrl,
  getInterview,
} from "@/lib/server/store";
import {
  isAllowedRecordingMimeType,
  MAX_RECORDING_BYTES,
  recordingExtensionFromFilename,
} from "@/lib/recording";

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

  let body: { filename?: unknown; contentType?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const filename = typeof body.filename === "string" ? body.filename : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json(
      { error: "Recording file is empty" },
      { status: 400 },
    );
  }
  if (size > MAX_RECORDING_BYTES) {
    return NextResponse.json(
      { error: "Recording exceeds the 200MB limit" },
      { status: 413 },
    );
  }
  if (!isAllowedRecordingMimeType(contentType)) {
    return NextResponse.json(
      { error: `Unsupported recording content type: ${contentType}` },
      { status: 415 },
    );
  }

  const upload = await createSignedRecordingUploadUrl(
    id,
    recordingExtensionFromFilename(filename),
  );
  if (!upload) {
    return NextResponse.json(
      { error: "Direct recording upload is unavailable without Supabase storage" },
      { status: 501 },
    );
  }

  return NextResponse.json(upload);
}
