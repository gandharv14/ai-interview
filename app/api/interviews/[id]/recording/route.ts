import { NextRequest, NextResponse } from "next/server";
import { transcribeRecordingIfSmall } from "@/lib/server/openai";
import { requireCandidateSession } from "@/lib/server/candidate-session";
import {
  isAllowedRecordingMimeType,
  MAX_RECORDING_BYTES,
  recordingExtensionFromFilename,
} from "@/lib/recording";
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
  if (!isAllowedRecordingMimeType(recording.type)) {
    return NextResponse.json(
      { error: `Unsupported recording content type: ${recording.type}` },
      { status: 415 },
    );
  }

  const extension = recordingExtensionFromFilename(recording.name);
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
