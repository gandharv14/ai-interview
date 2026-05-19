import { NextRequest, NextResponse } from "next/server";
import { transcribeRecordingIfSmall } from "@/lib/server/openai";
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

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const recording = formData.get("recording");
  if (!(recording instanceof File)) {
    return NextResponse.json(
      { error: "Recording file is required" },
      { status: 400 },
    );
  }

  const extension = recording.name.split(".").pop() || "webm";
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
