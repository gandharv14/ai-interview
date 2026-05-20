import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  buildRealtimeSdpUrl,
  CandidateInterviewFlow,
} from "@/components/candidate-interview-flow";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
});
