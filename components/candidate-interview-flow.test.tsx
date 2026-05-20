import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replaceMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

import {
  buildFinalRealtimeResponseEvent,
  buildInitialRealtimeResponseEvent,
  buildRealtimeSdpUrl,
  buildRoleReinforcementRealtimeEvent,
  buildVoiceSessionErrorMessage,
  CandidateInterviewFlow,
  extractRealtimeTranscriptEvent,
  formatInterviewTime,
} from "@/components/candidate-interview-flow";
import type { Interview, ParsedResume } from "@/lib/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  replaceMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("buildRealtimeSdpUrl", () => {
  it("appends the model query param", () => {
    expect(buildRealtimeSdpUrl("gpt-realtime-2")).toBe(
      "https://api.openai.com/v1/realtime/calls?model=gpt-realtime-2",
    );
  });

  it("URL-encodes special characters", () => {
    expect(buildRealtimeSdpUrl("gpt realtime/preview")).toContain(
      "model=gpt%20realtime%2Fpreview",
    );
  });
});

describe("buildInitialRealtimeResponseEvent", () => {
  it("asks the realtime agent to start the voice interview", () => {
    expect(buildInitialRealtimeResponseEvent()).toMatchObject({
      type: "response.create",
      response: {
        instructions: expect.stringContaining("Begin the interview now"),
      },
    });
  });
});

describe("buildFinalRealtimeResponseEvent", () => {
  it("asks the realtime agent to conclude without accepting interruptions", () => {
    expect(buildFinalRealtimeResponseEvent()).toMatchObject({
      type: "response.create",
      response: {
        instructions: expect.stringContaining("about to conclude"),
      },
    });
    expect(
      buildFinalRealtimeResponseEvent().response.instructions,
    ).toContain("Ignore any interruptions");
  });
});

describe("buildRoleReinforcementRealtimeEvent", () => {
  it("adds a system reminder that the agent is strictly an interviewer", () => {
    expect(buildRoleReinforcementRealtimeEvent()).toMatchObject({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [
          {
            type: "input_text",
            text: expect.stringContaining("not a coach"),
          },
        ],
      },
    });
    expect(
      buildRoleReinforcementRealtimeEvent().item.content[0].text,
    ).toContain("Stay strictly in interviewer mode");
  });
});

describe("formatInterviewTime", () => {
  it("formats remaining interview time as minutes and seconds", () => {
    expect(formatInterviewTime(20 * 60 * 1000)).toBe("20:00");
    expect(formatInterviewTime(30_000)).toBe("0:30");
    expect(formatInterviewTime(0)).toBe("0:00");
  });
});

describe("buildVoiceSessionErrorMessage", () => {
  it("tells the candidate how to prompt a quiet session", () => {
    expect(buildVoiceSessionErrorMessage("Realtime error")).toContain(
      'say "hello"',
    );
  });
});

describe("extractRealtimeTranscriptEvent", () => {
  it("extracts candidate transcript events", () => {
    expect(
      extractRealtimeTranscriptEvent({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "I led the migration.",
      }),
    ).toMatchObject({
      source: "candidate",
      text: "I led the migration.",
    });
  });

  it("extracts agent audio transcript events", () => {
    expect(
      extractRealtimeTranscriptEvent({
        type: "response.output_audio_transcript.done",
        response_id: "resp_1",
        item_id: "item_1",
        transcript: "Can you describe the tradeoffs?",
      }),
    ).toMatchObject({
      source: "agent",
      text: "Can you describe the tradeoffs?",
    });
  });

  it("extracts nested agent transcripts from completed responses", () => {
    expect(
      extractRealtimeTranscriptEvent({
        type: "response.done",
        response: {
          id: "resp_1",
          output: [
            {
              id: "item_1",
              content: [
                {
                  type: "output_audio",
                  transcript: "What did you personally implement?",
                },
              ],
            },
          ],
        },
      }),
    ).toMatchObject({
      source: "agent",
      text: "What did you personally implement?",
    });
  });
});

describe("CandidateInterviewFlow component shell", () => {
  it("renders the upload form initially without crashing", () => {
    render(
      <CandidateInterviewFlow
        token="test-token"
        roleTitle="Senior Engineer"
        level="L5"
      />,
    );
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
    expect(screen.getByText("Resume Upload")).toBeInTheDocument();
  });

  it("registers and removes a beforeunload handler across mounts", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(
      <CandidateInterviewFlow
        token="test-token"
        roleTitle="Senior Engineer"
        level="L5"
      />,
    );
    const addedBeforeUnload = addSpy.mock.calls.some(
      ([eventName]) => eventName === "beforeunload",
    );
    expect(addedBeforeUnload).toBe(true);

    unmount();
    const removedBeforeUnload = removeSpy.mock.calls.some(
      ([eventName]) => eventName === "beforeunload",
    );
    expect(removedBeforeUnload).toBe(true);
  });

  it("shows a resume upload and parsing spinner while starting the interview", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(
      <CandidateInterviewFlow
        token="test-token"
        roleTitle="Senior Engineer"
        level="L5"
      />,
    );

    const resumeInput = screen.getByLabelText("Resume");
    const resume = new File(["resume"], "resume.pdf", {
      type: "application/pdf",
    });
    const validFormData = new FormData();
    validFormData.set("resume", resume);
    validFormData.set("consent", "on");
    vi.stubGlobal(
      "FormData",
      vi.fn(function FormDataMock() {
        return validFormData;
      }),
    );

    await userEvent.upload(resumeInput, resume);
    await userEvent.click(screen.getByRole("checkbox"));
    const form = screen.getByRole("button", { name: "Continue" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Uploading and parsing" }),
      ).toBeDisabled();
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Uploading and parsing your resume",
    );
  });

  it("reinforces strict interviewer mode after six candidate turns", async () => {
    const { dataChannel } = stubRealtimeBrowserApis();
    const parsedResume = makeParsedResume();
    const interview = makeInterview(parsedResume);
    const liveInterview = {
      ...interview,
      status: "in_progress" as const,
      startedAt: new Date().toISOString(),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/interviews/start") {
          return jsonResponse({ interview, parsedResume });
        }
        if (url === `/api/interviews/${interview.id}/realtime-token`) {
          return jsonResponse({
            clientSecret: "rt_secret",
            model: "gpt-realtime-2",
            interview: liveInterview,
          });
        }
        if (url.startsWith("https://api.openai.com/v1/realtime/calls")) {
          return new Response("answer-sdp", { status: 200 });
        }
        return jsonResponse({ events: [] });
      }),
    );

    const validFormData = new FormData();
    validFormData.set("resume", new File(["resume"], "resume.pdf", {
      type: "application/pdf",
    }));
    validFormData.set("consent", "on");
    vi.stubGlobal(
      "FormData",
      vi.fn(function FormDataMock() {
        return validFormData;
      }),
    );

    render(
      <CandidateInterviewFlow
        token="test-token"
        roleTitle="Senior Engineer"
        level="L5"
      />,
    );

    const form = screen.getByRole("button", { name: "Continue" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    const startButton = await screen.findByRole("button", {
      name: "Start voice interview",
    });
    fireEvent.click(startButton);

    await screen.findByText(/Voice interview is live/);
    await waitFor(() => {
      expect(dataChannel.send).toHaveBeenCalled();
    });
    dataChannel.send.mockClear();

    for (let index = 0; index < 6; index += 1) {
      dataChannel.emitMessage(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          item_id: `candidate_${index}`,
          transcript: `candidate answer ${index}`,
        }),
      );
    }

    await waitFor(() => {
      const sentEvents = dataChannel.send.mock.calls.map(([payload]) =>
        JSON.parse(String(payload)),
      );
      const reinforcementEvents = sentEvents.filter(
        (event) => event.type === "conversation.item.create",
      );
      expect(reinforcementEvents).toHaveLength(1);
      expect(reinforcementEvents[0]).toMatchObject({
        item: {
          role: "system",
          content: [
            {
              text: expect.stringContaining("strictly in interviewer mode"),
            },
          ],
        },
      });
    });
  });

  it("shows the final timer warning and asks the agent to conclude", async () => {
    const nowMs = Date.parse("2026-01-01T00:20:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(nowMs);
    const { dataChannel, micTrack } = stubRealtimeBrowserApis();
    const parsedResume = makeParsedResume();
    const interview = makeInterview(parsedResume);
    const liveInterview = {
      ...interview,
      status: "in_progress" as const,
      startedAt: new Date(nowMs - (20 * 60 * 1000 - 29_000)).toISOString(),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/interviews/start") {
          return jsonResponse({ interview, parsedResume });
        }
        if (url === `/api/interviews/${interview.id}/realtime-token`) {
          return jsonResponse({
            clientSecret: "rt_secret",
            model: "gpt-realtime-2",
            interview: liveInterview,
          });
        }
        if (url.startsWith("https://api.openai.com/v1/realtime/calls")) {
          return new Response("answer-sdp", { status: 200 });
        }
        return jsonResponse({ events: [] });
      }),
    );

    const validFormData = new FormData();
    validFormData.set("resume", new File(["resume"], "resume.pdf", {
      type: "application/pdf",
    }));
    validFormData.set("consent", "on");
    vi.stubGlobal(
      "FormData",
      vi.fn(function FormDataMock() {
        return validFormData;
      }),
    );

    render(
      <CandidateInterviewFlow
        token="test-token"
        roleTitle="Senior Engineer"
        level="L5"
      />,
    );

    const form = screen.getByRole("button", { name: "Continue" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    const startButton = await screen.findByRole("button", {
      name: "Start voice interview",
    });
    fireEvent.click(startButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Final 30 seconds",
    );
    expect(screen.getByLabelText("0:29 remaining")).toBeInTheDocument();
    await waitFor(() => {
      const sentEvents = dataChannel.send.mock.calls.map(([payload]) =>
        JSON.parse(String(payload)),
      );
      expect(sentEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "response.create",
            response: expect.objectContaining({
              instructions: expect.stringContaining("about to conclude"),
            }),
          }),
        ]),
      );
    });
    expect(micTrack.enabled).toBe(false);
  });

  it("automatically finishes, uploads, and routes to thank you at the time limit", async () => {
    const nowMs = Date.parse("2026-01-01T00:20:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(nowMs);
    stubRealtimeBrowserApis();
    const parsedResume = makeParsedResume();
    const interview = makeInterview(parsedResume);
    const liveInterview = {
      ...interview,
      status: "in_progress" as const,
      startedAt: new Date(nowMs - 20 * 60 * 1000).toISOString(),
    };
    const completedInterview = {
      ...liveInterview,
      status: "completed" as const,
      completedAt: new Date(nowMs).toISOString(),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/interviews/start") {
        return jsonResponse({ interview, parsedResume });
      }
      if (url === `/api/interviews/${interview.id}/realtime-token`) {
        return jsonResponse({
          clientSecret: "rt_secret",
          model: "gpt-realtime-2",
          interview: liveInterview,
        });
      }
      if (url.startsWith("https://api.openai.com/v1/realtime/calls")) {
        return new Response("answer-sdp", { status: 200 });
      }
      if (url === `/api/interviews/${interview.id}/recording`) {
        return jsonResponse({ recordingPath: "interview_1/recording.webm" });
      }
      if (url === `/api/interviews/${interview.id}/complete`) {
        return jsonResponse({ interview: completedInterview });
      }
      return jsonResponse({ events: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const validFormData = new FormData();
    validFormData.set("resume", new File(["resume"], "resume.pdf", {
      type: "application/pdf",
    }));
    validFormData.set("consent", "on");
    vi.stubGlobal(
      "FormData",
      vi.fn(function FormDataMock() {
        return validFormData;
      }),
    );

    render(
      <CandidateInterviewFlow
        token="test-token"
        roleTitle="Senior Engineer"
        level="L5"
      />,
    );

    const form = screen.getByRole("button", { name: "Continue" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    const startButton = await screen.findByRole("button", {
      name: "Start voice interview",
    });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/interviews/${interview.id}/recording`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/interviews/${interview.id}/complete`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(replaceMock).toHaveBeenCalledWith("/i/test-token/thank-you");
    });
  });
});

function makeParsedResume(): ParsedResume {
  return {
    headline: "Built distributed systems",
    skills: ["TypeScript"],
    experience: [],
    projects: [],
    education: [],
    highSignalClaims: [],
  };
}

function makeInterview(parsedResume: ParsedResume): Interview {
  return {
    id: "interview_1",
    candidateName: "Ada",
    roleTitle: "Senior Engineer",
    level: "L5",
    jobDescription: "Backend systems",
    status: "ready",
    parsedResume,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubRealtimeBrowserApis() {
  type MockTrack = {
    enabled: boolean;
    stop: ReturnType<typeof vi.fn>;
  };

  class MockMediaStream {
    constructor(private tracks: MockTrack[] = []) {}

    getTracks() {
      return this.tracks;
    }

    getAudioTracks() {
      return this.tracks;
    }

    addTrack(track: MockTrack) {
      this.tracks.push(track);
    }
  }

  class MockDataChannel {
    readyState = "open";
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = "closed";
    });
    private listeners = new Map<string, Array<(event: { data: string }) => void>>();
    addEventListener = vi.fn(
      (eventName: string, listener: (event: { data: string }) => void) => {
        const listeners = this.listeners.get(eventName) ?? [];
        listeners.push(listener);
        this.listeners.set(eventName, listeners);
      },
    );

    emitMessage(data: string) {
      this.listeners.get("message")?.forEach((listener) => listener({ data }));
    }
  }

  const dataChannel = new MockDataChannel();
  class MockRTCPeerConnection {
    ontrack: ((event: { streams: MockMediaStream[] }) => void) | null = null;
    addTrack = vi.fn();
    createDataChannel = vi.fn(() => dataChannel);
    createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" }));
    setLocalDescription = vi.fn(async () => undefined);
    setRemoteDescription = vi.fn(async () => {
      this.ontrack?.({
        streams: [new MockMediaStream([{ enabled: true, stop: vi.fn() }])],
      });
    });
    close = vi.fn();
  }

  class MockAudioContext {
    createMediaStreamDestination() {
      return { stream: new MockMediaStream() };
    }

    createMediaStreamSource() {
      return { connect: vi.fn() };
    }

    close = vi.fn(async () => undefined);
  }

  class MockMediaRecorder {
    static isTypeSupported = vi.fn(() => true);
    state = "inactive";
    mimeType = "audio/webm;codecs=opus";
    private listeners = new Map<string, (event?: { data: Blob }) => void>();

    constructor(
      readonly stream: MockMediaStream,
      readonly options: Record<string, unknown>,
    ) {}

    addEventListener(eventName: string, listener: (event?: { data: Blob }) => void) {
      this.listeners.set(eventName, listener);
    }

    start() {
      this.state = "recording";
    }

    stop() {
      this.state = "inactive";
      this.listeners.get("dataavailable")?.({
        data: new Blob(["recorded audio"], { type: this.mimeType }),
      });
      this.listeners.get("stop")?.();
    }
  }

  const micTrack = { enabled: true, stop: vi.fn() };
  vi.stubGlobal("MediaStream", MockMediaStream);
  vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
  vi.stubGlobal("AudioContext", MockAudioContext);
  vi.stubGlobal("MediaRecorder", MockMediaRecorder);
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn(async () => new MockMediaStream([micTrack])),
    },
  });

  return { dataChannel, micTrack };
}
