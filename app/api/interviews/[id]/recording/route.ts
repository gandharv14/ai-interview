import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { transcribeRecordingIfSmall } from "@/lib/server/openai";
import { requireCandidateSession } from "@/lib/server/candidate-session";
import {
  appendInterviewEvents,
  getInterview,
  updateInterview,
  uploadRecording,
  uploadTranscript,
} from "@/lib/server/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

const MAX_RECORDING_BYTES = 200 * 1024 * 1024;
const ALLOWED_RECORDING_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/x-m4a",
  "audio/mp3",
  "video/webm", // browsers sometimes label webm/opus as video/webm
]);
const ALLOWED_RECORDING_EXTENSIONS = new Set([
  "webm",
  "mp4",
  "m4a",
  "mp3",
  "wav",
  "mpeg",
]);

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const unauthorized = await requireCandidateSession(request, id);
  if (unauthorized) return unauthorized;

  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart form data" },
      { status: 400 },
    );
  }

  const recording = formData.get("recording");
  if (!(recording instanceof File)) {
    return NextResponse.json(
      { error: "Recording file is required" },
      { status: 400 },
    );
  }
  if (recording.size === 0) {
    return NextResponse.json(
      { error: "Recording file is empty" },
      { status: 400 },
    );
  }
  if (recording.size > MAX_RECORDING_BYTES) {
    return NextResponse.json(
      { error: "Recording exceeds the 200MB limit" },
      { status: 413 },
    );
  }
  const mimeType = normalizeRecordingMimeType(recording.type);
  if (mimeType && !ALLOWED_RECORDING_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported recording content type: ${recording.type}` },
      { status: 415 },
    );
  }

  const rawExtension = path.extname(recording.name).slice(1).toLowerCase();
  const extension =
    rawExtension && ALLOWED_RECORDING_EXTENSIONS.has(rawExtension)
      ? rawExtension
      : "webm";

  const recordingPath = await uploadRecording(id, recording, extension);
  await updateInterview(id, { recordingPath });
  await appendInterviewEvents(id, [
    {
      source: "system",
      type: "recording_uploaded",
      text: `Recording uploaded (${Math.round(recording.size / 1024)}KB).`,
      payload: { recordingPath, contentType: recording.type },
    },
  ]);

  let transcriptPath: string | undefined;
  try {
    const transcript = await transcribeRecordingIfSmall(recording);
    if (transcript) {
      transcriptPath = await uploadTranscript(id, transcript);
      await appendInterviewEvents(id, [
        {
          source: "system",
          type: "diarized_transcript",
          text: transcript,
          payload: { transcriptPath },
        },
      ]);
    }
  } catch (error) {
    await appendInterviewEvents(id, [
      {
        source: "system",
        type: "diarized_transcript_failed",
        text: error instanceof Error ? error.message : "Transcription failed.",
      },
    ]);
  }

  return NextResponse.json({ recordingPath, transcriptPath });
}

function normalizeRecordingMimeType(contentType: string) {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}
