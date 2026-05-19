"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  FileUp,
  Mic,
  PhoneOff,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { Interview, InterviewEvent, ParsedResume } from "@/lib/types";

type Props = {
  token: string;
  roleTitle: string;
  level: string;
};

type Stage =
  | "upload"
  | "ready"
  | "connecting"
  | "live"
  | "finishing"
  | "completed";

type RealtimeTokenResponse = {
  clientSecret: string;
  model: string;
};

type StartResponse = {
  interview: Interview;
  parsedResume: ParsedResume;
  error?: string;
};

export function CandidateInterviewFlow({ token, roleTitle, level }: Props) {
  const [stage, setStage] = useState<Stage>("upload");
  const [error, setError] = useState("");
  const [interview, setInterview] = useState<Interview>();
  const [parsedResume, setParsedResume] = useState<ParsedResume>();
  const [events, setEvents] = useState<InterviewEvent[]>([]);
  const [recorderReady, setRecorderReady] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  async function submitResume(formData: FormData) {
    setError("");
    const resume = formData.get("resume");
    if (!(resume instanceof File) || resume.size === 0) {
      setError("Choose a resume file first.");
      return;
    }

    formData.set("token", token);
    formData.set("consent", formData.get("consent") === "on" ? "true" : "false");

    try {
      const response = await fetch("/api/interviews/start", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as StartResponse;
      if (!response.ok) throw new Error(data.error || "Could not start interview");
      setInterview(data.interview);
      setParsedResume(data.parsedResume);
      setStage("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start interview");
    }
  }

  async function persistEvents(
    interviewId: string,
    nextEvents: Array<{
      source: "candidate" | "agent" | "system";
      type: string;
      text?: string;
      payload?: unknown;
    }>,
  ) {
    const response = await fetch(`/api/interviews/${interviewId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: nextEvents }),
    });
    const data = (await response.json()) as { events?: InterviewEvent[] };
    if (data.events) setEvents((current) => [...current, ...data.events!]);
  }

  async function startInterview() {
    if (!interview) return;
    if (process.env.NEXT_PUBLIC_MOCK_REALTIME === "1") {
      await runMockInterview(interview);
      return;
    }

    setError("");
    setStage("connecting");
    try {
      const tokenResponse = await fetch(
        `/api/interviews/${interview.id}/realtime-token`,
        { method: "POST" },
      );
      const tokenData = (await tokenResponse.json()) as RealtimeTokenResponse & {
        error?: string;
      };
      if (!tokenResponse.ok) {
        throw new Error(tokenData.error || "Could not create realtime session");
      }

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;
      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = micStream;
      micStream.getTracks().forEach((track) => pc.addTrack(track, micStream));

      const recorderTools = await createRecorder(micStream);
      setRecorderReady(true);

      pc.ontrack = (event) => {
        event.streams[0]?.getAudioTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
        if (audioRef.current) {
          audioRef.current.srcObject = remoteStream;
        }
        recorderTools.connectRemote(remoteStream);
      };

      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;
      dc.addEventListener("message", (message) => {
        void handleRealtimeEvent(interview.id, message.data);
      });
      dc.addEventListener("open", () => {
        dc.send(JSON.stringify({ type: "response.create" }));
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${tokenData.clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        throw new Error(await sdpResponse.text());
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });

      mediaRecorderRef.current?.start(1000);
      setStage("live");
    } catch (err) {
      await cleanupMedia();
      setStage("ready");
      setError(err instanceof Error ? err.message : "Could not start voice session");
    }
  }

  async function handleRealtimeEvent(interviewId: string, raw: string) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = String(event.type ?? "realtime_event");
    if (type === "conversation.item.input_audio_transcription.completed") {
      await persistEvents(interviewId, [
        {
          source: "candidate",
          type,
          text: typeof event.transcript === "string" ? event.transcript : undefined,
          payload: event,
        },
      ]);
      return;
    }
    if (type === "response.audio_transcript.done") {
      await persistEvents(interviewId, [
        {
          source: "agent",
          type,
          text: typeof event.transcript === "string" ? event.transcript : undefined,
          payload: event,
        },
      ]);
      return;
    }
    if (type === "response.output_text.done") {
      await persistEvents(interviewId, [
        {
          source: "agent",
          type,
          text: typeof event.text === "string" ? event.text : undefined,
          payload: event,
        },
      ]);
      return;
    }
    if (type === "error") {
      const message =
        typeof event.error === "object" && event.error && "message" in event.error
          ? String((event.error as { message?: unknown }).message)
          : "Realtime error";
      await persistEvents(interviewId, [
        { source: "system", type, text: message, payload: event },
      ]);
    }
  }

  async function finishInterview() {
    if (!interview) return;
    setStage("finishing");
    try {
      const recording = await stopRecording();
      await cleanupMedia();
      if (recording.size > 0) {
        const formData = new FormData();
        formData.set(
          "recording",
          new File([recording], "interview.webm", {
            type: recording.type || "audio/webm",
          }),
        );
        const upload = await fetch(`/api/interviews/${interview.id}/recording`, {
          method: "POST",
          body: formData,
        });
        if (!upload.ok) throw new Error("Recording upload failed");
      }
      const complete = await fetch(`/api/interviews/${interview.id}/complete`, {
        method: "POST",
      });
      const data = (await complete.json()) as { interview?: Interview; error?: string };
      if (!complete.ok) throw new Error(data.error || "Could not complete interview");
      if (data.interview) setInterview(data.interview);
      setStage("completed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish interview");
      setStage("live");
    }
  }

  async function runMockInterview(current: Interview) {
    setStage("connecting");
    await persistEvents(current.id, [
      {
        source: "system",
        type: "mock_realtime_started",
        text: "Mock realtime session started.",
      },
      {
        source: "agent",
        type: "response.audio_transcript.done",
        text: "Thanks for joining. Can you walk me through a recent project from your resume and your personal role?",
      },
      {
        source: "candidate",
        type: "conversation.item.input_audio_transcription.completed",
        text: "I owned the API redesign, rollout plan, and monitoring for the migration.",
      },
    ]);
    setStage("finishing");
    const formData = new FormData();
    formData.set(
      "recording",
      new File([new Blob(["mock interview audio"], { type: "audio/webm" })], "interview.webm", {
        type: "audio/webm",
      }),
    );
    await fetch(`/api/interviews/${current.id}/recording`, {
      method: "POST",
      body: formData,
    });
    const complete = await fetch(`/api/interviews/${current.id}/complete`, {
      method: "POST",
    });
    const data = (await complete.json()) as { interview?: Interview };
    if (data.interview) setInterview(data.interview);
    setStage("completed");
  }

  async function createRecorder(micStream: MediaStream) {
    recordedChunksRef.current = [];
    const AudioContextConstructor =
      window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextConstructor();
    audioContextRef.current = audioContext;
    const destination = audioContext.createMediaStreamDestination();
    audioContext.createMediaStreamSource(micStream).connect(destination);
    let remoteConnected = false;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(destination.stream, {
      mimeType,
      audioBitsPerSecond: 64_000,
    });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    });
    mediaRecorderRef.current = recorder;

    return {
      connectRemote(remoteStream: MediaStream) {
        if (remoteConnected || remoteStream.getAudioTracks().length === 0) return;
        audioContext.createMediaStreamSource(remoteStream).connect(destination);
        remoteConnected = true;
      },
    };
  }

  async function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return new Blob([], { type: "audio/webm" });
    }
    const stopped = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });
    recorder.stop();
    await stopped;
    return new Blob(recordedChunksRef.current, { type: recorder.mimeType });
  }

  async function cleanupMedia() {
    dataChannelRef.current?.close();
    peerConnectionRef.current?.close();
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    await audioContextRef.current?.close().catch(() => undefined);
    setRecorderReady(false);
  }

  return (
    <div className="shell py-8">
      <header className="mb-6">
        <p className="muted text-sm font-bold uppercase tracking-wide">
          {level}
        </p>
        <h1 className="mt-1 text-3xl font-bold">{roleTitle}</h1>
      </header>

      <div className="grid-two">
        <section className="panel p-5">
          {stage === "upload" ? (
            <form
              className="grid gap-4"
              action={(formData) => {
                void submitResume(formData);
              }}
            >
              <div className="flex items-center gap-2">
                <FileUp size={19} aria-hidden />
                <h2 className="text-xl font-bold">Resume Upload</h2>
              </div>
              <div className="field">
                <label htmlFor="candidateName">Name</label>
                <input id="candidateName" name="candidateName" className="input" />
              </div>
              <div className="field">
                <label htmlFor="candidateEmail">Email</label>
                <input
                  id="candidateEmail"
                  name="candidateEmail"
                  type="email"
                  className="input"
                />
              </div>
              <div className="field">
                <label htmlFor="resume">Resume</label>
                <input
                  id="resume"
                  name="resume"
                  className="file-input"
                  type="file"
                  accept=".pdf,.docx,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  required
                />
              </div>
              <label className="flex items-start gap-3 text-sm font-bold">
                <input name="consent" type="checkbox" required className="mt-1" />
                <span>
                  I consent to recording and storing this interview for review.
                </span>
              </label>
              <button className="button button-primary" type="submit">
                <Send size={17} aria-hidden />
                Continue
              </button>
            </form>
          ) : null}

          {stage !== "upload" ? (
            <div className="grid gap-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={19} aria-hidden />
                <h2 className="text-xl font-bold">Interview Session</h2>
              </div>
              <p className="muted text-sm">
                {stage === "ready"
                  ? "Resume parsed. Voice interview is ready."
                  : stage === "live"
                    ? "Voice interview is live."
                    : stage === "completed"
                      ? "Interview complete."
                      : "Preparing interview session."}
              </p>
              <audio ref={audioRef} autoPlay />
              <div className="flex flex-wrap gap-2">
                {stage === "ready" ? (
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => void startInterview()}
                  >
                    <Mic size={17} aria-hidden />
                    Start voice interview
                  </button>
                ) : null}
                {stage === "live" ? (
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => void finishInterview()}
                  >
                    <PhoneOff size={17} aria-hidden />
                    Finish interview
                  </button>
                ) : null}
                {stage === "connecting" || stage === "finishing" ? (
                  <button className="button button-secondary" type="button" disabled>
                    {stage === "connecting" ? "Connecting" : "Saving"}
                  </button>
                ) : null}
              </div>
              {recorderReady ? (
                <p className="text-sm font-bold text-emerald-700">
                  Recording active
                </p>
              ) : null}
              {stage === "completed" ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 size={18} aria-hidden />
                    Complete
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="mt-4 text-sm font-bold text-red-700">{error}</p> : null}
        </section>

        <aside className="panel p-5">
          <h2 className="mb-3 text-xl font-bold">Resume Context</h2>
          {!parsedResume ? (
            <p className="muted text-sm">Waiting for resume.</p>
          ) : (
            <div className="grid gap-4">
              <div>
                <p className="font-bold">{parsedResume.candidateName || "Candidate"}</p>
                <p className="muted mt-1 text-sm">{parsedResume.headline}</p>
              </div>
              <div>
                <p className="mb-2 text-sm font-bold">Skills</p>
                <div className="flex flex-wrap gap-2">
                  {parsedResume.skills.slice(0, 12).map((skill) => (
                    <span className="badge" key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-bold">Transcript</p>
                <div className="grid max-h-80 gap-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {events.length === 0 ? (
                    <p className="muted text-sm">No transcript yet.</p>
                  ) : (
                    events
                      .filter((event) => event.text)
                      .map((event) => (
                        <div key={event.id} className="text-sm">
                          <span className="font-bold capitalize">
                            {event.source}:{" "}
                          </span>
                          <span>{event.text}</span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
