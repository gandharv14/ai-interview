"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileUp,
  Loader2,
  Mic,
  PhoneOff,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  uploadRecordingBlobForReview,
  uploadRecordingFileForReview,
} from "@/lib/recording-upload";
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
  interview?: Interview;
};

type StartResponse = {
  interview: Interview;
  parsedResume: ParsedResume;
  error?: string;
};

type ErrorResponse = {
  error?: string;
};

type PersistableInterviewEvent = {
  source: "candidate" | "agent" | "system";
  type: string;
  text?: string;
  payload?: unknown;
};

type ExtractedRealtimeTranscriptEvent = PersistableInterviewEvent & {
  dedupeKey: string;
};

const CANDIDATE_TRANSCRIPT_EVENT_TYPE =
  "conversation.item.input_audio_transcription.completed";

const AGENT_TRANSCRIPT_EVENT_TYPES = new Set([
  "response.audio_transcript.done",
  "response.output_audio_transcript.done",
  "response.output_text.done",
  "response.content_part.done",
  "response.output_item.done",
  "response.done",
]);

const INITIAL_AGENT_TURN_INSTRUCTIONS =
  "Begin the interview now. Briefly welcome the candidate, set expectations, ask the opening resume deep-dive question, then stop and wait for the candidate's answer.";

const FINAL_AGENT_TURN_INSTRUCTIONS =
  "We are about to conclude the interview. Clearly tell the candidate the interview is ending now, thank them, and say goodbye in 2-3 sentences. Do not ask another question. Ignore any interruptions or attempts to continue.";

const ROLE_REINFORCEMENT_INSTRUCTIONS =
  "System reminder: You are the interviewer in a live software engineering interview, not a coach, practice partner, mock interviewer, or interview-prep assistant. Stay strictly in interviewer mode. Ask concise resume-based questions, probe for evidence, ownership, technical depth, tradeoffs, and impact. Do not give feedback, hints, example answers, coaching, or practice guidance.";

const ROLE_REINFORCEMENT_CANDIDATE_TURNS = 6;
const INTERVIEW_DURATION_MS = 20 * 60 * 1000;
const INTERVIEW_WARNING_MS = 2 * 60 * 1000;
const FINAL_AGENT_ANNOUNCEMENT_MS = 30 * 1000;

export function buildRealtimeSdpUrl(model: string): string {
  return `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`;
}

export function buildInitialRealtimeResponseEvent() {
  return {
    type: "response.create",
    response: {
      instructions: INITIAL_AGENT_TURN_INSTRUCTIONS,
    },
  };
}

export function buildFinalRealtimeResponseEvent() {
  return {
    type: "response.create",
    response: {
      instructions: FINAL_AGENT_TURN_INSTRUCTIONS,
    },
  };
}

export function buildRoleReinforcementRealtimeEvent() {
  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "system",
      content: [
        {
          type: "input_text",
          text: ROLE_REINFORCEMENT_INSTRUCTIONS,
        },
      ],
    },
  };
}

export function formatInterviewTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function buildVoiceSessionErrorMessage(message?: string) {
  const detail = message?.trim() || "Could not start voice session";
  if (isMicrophonePermissionError(detail)) {
    return "Microphone permission was denied. Allow microphone access for this site in your browser settings, then click Start voice interview again.";
  }
  return `${detail}. If the interviewer stays quiet, say "hello" into your microphone to prompt the conversation.`;
}

export function extractRealtimeTranscriptEvent(
  event: Record<string, unknown>,
): ExtractedRealtimeTranscriptEvent | undefined {
  const type = String(event.type ?? "realtime_event");
  if (type === CANDIDATE_TRANSCRIPT_EVENT_TYPE) {
    const text = extractTranscriptText(event);
    if (!text) return undefined;
    return {
      source: "candidate",
      type,
      text,
      payload: event,
      dedupeKey: buildTranscriptDedupeKey("candidate", event, text),
    };
  }

  if (AGENT_TRANSCRIPT_EVENT_TYPES.has(type)) {
    const text = extractTranscriptText(event);
    if (!text) return undefined;
    return {
      source: "agent",
      type,
      text,
      payload: event,
      dedupeKey: buildTranscriptDedupeKey("agent", event, text),
    };
  }

  return undefined;
}

export function CandidateInterviewFlow({ token, roleTitle, level }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("upload");
  const [error, setError] = useState("");
  const [interview, setInterview] = useState<Interview>();
  const [parsedResume, setParsedResume] = useState<ParsedResume>();
  const [events, setEvents] = useState<InterviewEvent[]>([]);
  const [recorderReady, setRecorderReady] = useState(false);
  const [isResumeSubmitting, setIsResumeSubmitting] = useState(false);
  const [interviewStartedAtMs, setInterviewStartedAtMs] = useState<number>();
  const [remainingMs, setRemainingMs] = useState(INTERVIEW_DURATION_MS);

  const audioRef = useRef<HTMLAudioElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const stageRef = useRef<Stage>("upload");
  const persistedTranscriptKeysRef = useRef<Set<string>>(new Set());
  const initialAgentTurnRequestedRef = useRef(false);
  const finalAgentTurnRequestedRef = useRef(false);
  const roleReinforcementRequestedRef = useRef(false);
  const candidateTurnCountRef = useRef(0);
  const finishInterviewRequestedRef = useRef(false);
  const finishInterviewRef = useRef<() => void>(() => undefined);
  const requestFinalAgentTurnRef = useRef<() => void>(() => undefined);

  const isLive = stage === "live";
  const isTimerWarning = isLive && remainingMs <= INTERVIEW_WARNING_MS;
  const isFinalTimerWarning =
    isLive && remainingMs <= FINAL_AGENT_ANNOUNCEMENT_MS;
  const timerLabel = formatInterviewTime(remainingMs);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    finishInterviewRef.current = () => {
      void finishInterview();
    };
    requestFinalAgentTurnRef.current = () => {
      requestFinalAgentTurn();
    };
  });

  useEffect(() => {
    if (stage !== "live" || interviewStartedAtMs === undefined) return;
    const startedAtMs = interviewStartedAtMs;

    function tick() {
      const nextRemainingMs = calculateInterviewRemainingMs(startedAtMs);
      setRemainingMs(nextRemainingMs);

      if (nextRemainingMs <= FINAL_AGENT_ANNOUNCEMENT_MS) {
        requestFinalAgentTurnRef.current();
      }
      if (nextRemainingMs <= 0) {
        finishInterviewRef.current();
      }
    }

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [stage, interviewStartedAtMs]);

  const cleanupMedia = useCallback(async () => {
    try {
      dataChannelRef.current?.close();
    } catch {
      // ignore
    }
    try {
      peerConnectionRef.current?.close();
    } catch {
      // ignore
    }
    try {
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
    } catch {
      // ignore
    }
    try {
      remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    } catch {
      // ignore
    }
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
        // ignore
      }
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    dataChannelRef.current = null;
    peerConnectionRef.current = null;
    micStreamRef.current = null;
    remoteStreamRef.current = null;
    audioContextRef.current = null;
    mediaRecorderRef.current = null;
    setRecorderReady(false);
  }, []);

  useEffect(() => {
    function handleBeforeUnload() {
      if (
        stageRef.current === "live" ||
        stageRef.current === "connecting" ||
        stageRef.current === "finishing"
      ) {
        void cleanupMedia();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void cleanupMedia();
    };
  }, [cleanupMedia]);

  async function submitResume(formData: FormData) {
    setError("");
    const resume = formData.get("resume");
    if (!(resume instanceof File) || resume.size === 0) {
      setError("Choose a resume file first.");
      return;
    }
    if (!isPdfFile(resume)) {
      setError("Upload a PDF resume.");
      return;
    }

    formData.set("token", token);
    formData.set("consent", formData.get("consent") === "on" ? "true" : "false");

    setIsResumeSubmitting(true);
    try {
      const response = await fetch("/api/interviews/start", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const data = await readJsonResponse<StartResponse>(response);
      if (!response.ok) throw new Error(data.error || "Could not start interview");
      setInterview(data.interview);
      setParsedResume(data.parsedResume);
      setStage("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start interview");
    } finally {
      setIsResumeSubmitting(false);
    }
  }

  async function persistEvents(
    interviewId: string,
    nextEvents: PersistableInterviewEvent[],
  ) {
    const response = await fetch(`/api/interviews/${interviewId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: nextEvents }),
      credentials: "same-origin",
    });
    const data = (await response.json()) as { events?: InterviewEvent[] };
    const newEvents = data.events;
    if (newEvents && newEvents.length > 0) {
      setEvents((current) => [...current, ...newEvents]);
    }
  }

  async function refreshEvents(interviewId: string) {
    try {
      const response = await fetch(`/api/interviews/${interviewId}/events`, {
        method: "GET",
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { events?: InterviewEvent[] };
      if (data.events) setEvents(data.events);
    } catch {
      // ignore: refresh is best-effort
    }
  }

  async function startInterview() {
    if (!interview) return;
    if (process.env.NEXT_PUBLIC_MOCK_REALTIME === "1") {
      await runMockInterview(interview);
      return;
    }

    setError("");
    initialAgentTurnRequestedRef.current = false;
    finalAgentTurnRequestedRef.current = false;
    roleReinforcementRequestedRef.current = false;
    candidateTurnCountRef.current = 0;
    finishInterviewRequestedRef.current = false;
    setInterviewStartedAtMs(undefined);
    setRemainingMs(INTERVIEW_DURATION_MS);
    setStage("connecting");
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = micStream;

      const tokenResponse = await fetch(
        `/api/interviews/${interview.id}/realtime-token`,
        { method: "POST", credentials: "same-origin" },
      );
      const tokenData = await readJsonResponse<
        RealtimeTokenResponse & ErrorResponse
      >(tokenResponse);
      if (!tokenResponse.ok) {
        throw new Error(tokenData.error || "Could not create realtime session");
      }
      if (tokenData.interview) setInterview(tokenData.interview);
      const startedAtMs = parseInterviewStartedAtMs(
        tokenData.interview?.startedAt ?? interview.startedAt,
      );
      setInterviewStartedAtMs(startedAtMs);
      setRemainingMs(calculateInterviewRemainingMs(startedAtMs));

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;
      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;

      micStream.getTracks().forEach((track) => pc.addTrack(track, micStream));

      const recorderTools = await createRecorder(micStream);
      setRecorderReady(true);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "inactive"
      ) {
        mediaRecorderRef.current.start(1000);
      }

      pc.ontrack = (event) => {
        event.streams[0]?.getAudioTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
        if (audioRef.current) {
          audioRef.current.srcObject = remoteStream;
        }
        recorderTools.connectRemote(remoteStream);
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "inactive"
        ) {
          mediaRecorderRef.current.start(1000);
        }
      };

      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;
      dc.addEventListener("message", (message) => {
        void handleRealtimeEvent(interview.id, message.data);
      });
      dc.addEventListener("open", () => {
        window.setTimeout(() => requestInitialAgentTurn(dc), 300);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch(buildRealtimeSdpUrl(tokenData.model), {
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

      requestInitialAgentTurn(dc);
      setStage("live");
    } catch (err) {
      await cleanupMedia();
      setRecorderReady(false);
      setInterviewStartedAtMs(undefined);
      setRemainingMs(INTERVIEW_DURATION_MS);
      finalAgentTurnRequestedRef.current = false;
      roleReinforcementRequestedRef.current = false;
      candidateTurnCountRef.current = 0;
      finishInterviewRequestedRef.current = false;
      setStage("ready");
      setError(
        buildVoiceSessionErrorMessage(
          err instanceof Error ? err.message : undefined,
        ),
      );
    }
  }

  function requestInitialAgentTurn(dc = dataChannelRef.current) {
    if (!dc || dc.readyState !== "open" || initialAgentTurnRequestedRef.current) {
      return;
    }
    initialAgentTurnRequestedRef.current = true;
    dc.send(JSON.stringify(buildInitialRealtimeResponseEvent()));
  }

  function requestFinalAgentTurn(dc = dataChannelRef.current) {
    if (!dc || dc.readyState !== "open" || finalAgentTurnRequestedRef.current) {
      return;
    }
    finalAgentTurnRequestedRef.current = true;
    muteCandidateMic();
    dc.send(JSON.stringify(buildFinalRealtimeResponseEvent()));
  }

  function requestRoleReinforcement(dc = dataChannelRef.current) {
    if (
      !dc ||
      dc.readyState !== "open" ||
      roleReinforcementRequestedRef.current ||
      finalAgentTurnRequestedRef.current ||
      stageRef.current !== "live"
    ) {
      return;
    }
    roleReinforcementRequestedRef.current = true;
    dc.send(JSON.stringify(buildRoleReinforcementRealtimeEvent()));
  }

  function muteCandidateMic() {
    micStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
  }

  async function handleRealtimeEvent(interviewId: string, raw: string) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = String(event.type ?? "realtime_event");
    if (type === "session.created" || type === "session.updated") {
      requestInitialAgentTurn();
    }

    const transcriptEvent = extractRealtimeTranscriptEvent(event);
    if (transcriptEvent) {
      if (persistedTranscriptKeysRef.current.has(transcriptEvent.dedupeKey)) {
        return;
      }
      persistedTranscriptKeysRef.current.add(transcriptEvent.dedupeKey);
      const eventToPersist: PersistableInterviewEvent = {
        source: transcriptEvent.source,
        type: transcriptEvent.type,
        text: transcriptEvent.text,
        payload: transcriptEvent.payload,
      };
      if (transcriptEvent.source === "candidate") {
        candidateTurnCountRef.current += 1;
        if (candidateTurnCountRef.current >= ROLE_REINFORCEMENT_CANDIDATE_TURNS) {
          requestRoleReinforcement();
        }
      }
      await persistEvents(interviewId, [eventToPersist]);
      return;
    }
    if (type === "error") {
      const message =
        typeof event.error === "object" && event.error && "message" in event.error
          ? String((event.error as { message?: unknown }).message)
          : "Realtime error";
      setError(buildVoiceSessionErrorMessage(message));
      await persistEvents(interviewId, [
        { source: "system", type, text: message, payload: event },
      ]);
    }
  }

  async function finishInterview() {
    if (
      !interview ||
      finishInterviewRequestedRef.current ||
      stageRef.current === "finishing" ||
      stageRef.current === "completed"
    ) {
      return;
    }
    finishInterviewRequestedRef.current = true;
    setStage("finishing");
    try {
      const recording = await stopRecording();
      await cleanupMedia();
      if (recording.size === 0) {
        throw new Error("Recording did not capture audio. Please try again.");
      }
      await uploadRecordingBlobForReview(interview.id, recording);
      const complete = await fetch(`/api/interviews/${interview.id}/complete`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await readJsonResponse<{
        interview?: Interview;
        error?: string;
      }>(complete);
      if (!complete.ok) throw new Error(data.error || "Could not complete interview");
      if (data.interview) setInterview(data.interview);
      setInterviewStartedAtMs(undefined);
      setRemainingMs(0);
      setStage("completed");
      router.replace(`/i/${encodeURIComponent(token)}/thank-you`);
    } catch (err) {
      finishInterviewRequestedRef.current = false;
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
    const recording = formData.get("recording");
    if (recording instanceof File) {
      await uploadRecordingFileForReview(current.id, recording);
    }
    const complete = await fetch(`/api/interviews/${current.id}/complete`, {
      method: "POST",
      credentials: "same-origin",
    });
    const data = await readJsonResponse<{ interview?: Interview }>(complete);
    if (data.interview) setInterview(data.interview);
    await refreshEvents(current.id);
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
      const blob = new Blob(recordedChunksRef.current, {
        type: recorder?.mimeType || "audio/webm",
      });
      recordedChunksRef.current = [];
      return blob;
    }
    const stopped = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });
    recorder.stop();
    await stopped;
    const blob = new Blob(recordedChunksRef.current, {
      type: recorder.mimeType,
    });
    recordedChunksRef.current = [];
    return blob;
  }

  return (
    <div className="shell py-8 sm:py-10">
      <header className="panel panel-strong mb-6 p-6 sm:p-8">
        <p className="section-kicker">{level}</p>
        <h1 className="page-title mt-3">{roleTitle}</h1>
        <p className="muted mt-4 max-w-2xl">
          Upload your resume, confirm consent, and join the guided voice
          interview when the session is ready.
        </p>
      </header>

      <div className="grid-two">
        <section className="panel p-5 sm:p-6">
          {stage === "upload" ? (
            <form
              className="grid gap-5"
              aria-busy={isResumeSubmitting}
              onSubmit={(event) => {
                event.preventDefault();
                if (isResumeSubmitting) return;
                void submitResume(new FormData(event.currentTarget));
              }}
            >
              <div className="flex items-start gap-3">
                <span className="rounded-full border border-border bg-panel-subtle p-2">
                  <FileUp size={18} aria-hidden />
                </span>
                <div>
                  <p className="section-kicker">Candidate Intake</p>
                  <h2 className="section-title mt-1">Resume Upload</h2>
                </div>
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
                  accept="application/pdf,.pdf"
                  required
                />
                <p className="muted mt-1 text-sm">
                  PDF files only.
                </p>
              </div>
              <label className="flex items-start gap-3 text-sm font-bold">
                <input name="consent" type="checkbox" required className="mt-1" />
                <span>
                  I consent to recording and storing this interview for review.
                </span>
              </label>
              <button
                className="button button-primary"
                type="submit"
                disabled={isResumeSubmitting}
              >
                {isResumeSubmitting ? (
                  <Loader2 size={17} className="animate-spin" aria-hidden />
                ) : (
                  <Send size={17} aria-hidden />
                )}
                {isResumeSubmitting ? "Uploading and parsing" : "Continue"}
              </button>
              {isResumeSubmitting ? (
                <p className="muted text-sm" role="status">
                  Uploading and parsing your resume...
                </p>
              ) : null}
            </form>
          ) : null}

          {stage !== "upload" ? (
            <div className="grid gap-4">
              <div className="flex items-start gap-3">
                <span className="rounded-full border border-border bg-panel-subtle p-2">
                  <ShieldCheck size={18} aria-hidden />
                </span>
                <div>
                  <p className="section-kicker">Voice Session</p>
                  <h2 className="section-title mt-1">Interview Session</h2>
                </div>
              </div>
              <p className="muted text-sm">
                {stage === "ready"
                  ? "Resume parsed. Voice interview is ready."
                  : stage === "live"
                    ? 'Voice interview is live. The interviewer should begin. If it stays quiet, say "hello" into your microphone.'
                    : stage === "completed"
                      ? "Interview complete."
                      : "Preparing interview session."}
              </p>
              <audio ref={audioRef} autoPlay />
              {stage === "live" ? (
                <div
                  className={isTimerWarning ? "notice-strong p-4" : "notice p-4"}
                  role={isTimerWarning ? "alert" : "timer"}
                  aria-live={isTimerWarning ? "assertive" : "polite"}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold uppercase tracking-wide">
                      Time remaining
                    </span>
                    <span
                      className="font-mono text-2xl font-bold"
                      aria-label={`${timerLabel} remaining`}
                    >
                      {timerLabel}
                    </span>
                  </div>
                  {isTimerWarning ? (
                    <p className="mt-2 text-sm font-bold">
                      {isFinalTimerWarning
                        ? "Final 30 seconds: the interviewer is concluding now and interruptions are disabled."
                        : "Warning: the interview is about to end. Please wrap up your current answer."}
                    </p>
                  ) : (
                    <p className="muted mt-2 text-sm">
                      Interviews are capped at 20 minutes.
                    </p>
                  )}
                </div>
              ) : null}
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
                <p className="text-sm font-bold text-foreground">
                  Recording active
                </p>
              ) : null}
              {stage === "completed" ? (
                <div className="notice p-4">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 size={18} aria-hidden />
                    Complete
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="mt-4 text-sm font-bold text-foreground">{error}</p> : null}
        </section>

        <aside className="panel p-5 sm:p-6">
          <h2 className="section-title mb-3">Resume Context</h2>
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
                  {parsedResume.skills.slice(0, 12).map((skill, index) => (
                    <span className="badge" key={`${skill}-${index}`}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-bold">Transcript</p>
                <div className="notice grid max-h-80 gap-2 overflow-auto p-3">
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

async function readJsonResponse<T>(response: Response): Promise<T & ErrorResponse> {
  const text = await response.text();
  if (!text.trim()) {
    if (response.ok) {
      throw new Error("Server returned an empty response");
    }
    return {
      error: `Request failed with status ${response.status}`,
    } as T & ErrorResponse;
  }

  try {
    return JSON.parse(text) as T & ErrorResponse;
  } catch {
    if (!response.ok) {
      return {
        error: `Request failed with status ${response.status}`,
      } as T & ErrorResponse;
    }
    throw new Error("Server returned an invalid JSON response");
  }
}

function isPdfFile(file: File) {
  const type = file.type.toLowerCase();
  return file.name.toLowerCase().endsWith(".pdf") && (!type || type === "application/pdf");
}

function parseInterviewStartedAtMs(startedAt?: string) {
  const parsed = startedAt ? Date.parse(startedAt) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function calculateInterviewRemainingMs(startedAtMs: number, now = Date.now()) {
  return Math.max(0, INTERVIEW_DURATION_MS - (now - startedAtMs));
}

function isMicrophonePermissionError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("permission denied") ||
    normalized.includes("notallowederror") ||
    normalized.includes("not allowed") ||
    normalized.includes("permission dismissed")
  );
}

function extractTranscriptText(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const direct =
    getNonEmptyString(record.transcript) ??
    getNonEmptyString(record.text) ??
    getNonEmptyString(record.output_text);
  if (direct) return direct;

  const nested = [
    record.part,
    record.content_part,
    record.item,
    record.response,
    record.output,
    record.content,
  ];

  for (const item of nested) {
    const text = extractTranscriptTextFromNestedValue(item);
    if (text) return text;
  }

  return undefined;
}

function extractTranscriptTextFromNestedValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractTranscriptText(item);
      if (text) return text;
    }
    return undefined;
  }
  return extractTranscriptText(value);
}

function buildTranscriptDedupeKey(
  source: PersistableInterviewEvent["source"],
  event: Record<string, unknown>,
  text: string,
) {
  const response = asRecord(event.response);
  const item = asRecord(event.item) ?? firstRecord(response?.output);
  const responseId =
    getNonEmptyString(event.response_id) ?? getNonEmptyString(response?.id);
  const itemId = getNonEmptyString(event.item_id) ?? getNonEmptyString(item?.id);
  const normalizedText = text.replace(/\s+/g, " ").trim();

  return [source, responseId ?? "", itemId ?? "", normalizedText].join(":");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    const record = asRecord(item);
    if (record) return record;
  }
  return undefined;
}

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

