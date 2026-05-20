import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  buildInitialRealtimeResponseEvent,
  buildRealtimeSdpUrl,
  buildVoiceSessionErrorMessage,
  CandidateInterviewFlow,
  extractRealtimeTranscriptEvent,
} from "@/components/candidate-interview-flow";

afterEach(() => {
  cleanup();
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
});
