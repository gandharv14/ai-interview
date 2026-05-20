import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Interview, InterviewEvent } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  getAdminAccessStatus: vi.fn(),
  getInterview: vi.fn(),
  getInterviewSummary: vi.fn(),
  getPrivateFileUrl: vi.fn(),
  listInterviewEvents: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => mocks.notFound(),
  redirect: (url: string) => mocks.redirect(url),
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/server/admin", () => ({
  getAdminAccessStatus: () => mocks.getAdminAccessStatus(),
}));

vi.mock("@/lib/server/store", () => ({
  getInterview: (id: string) => mocks.getInterview(id),
  getInterviewSummary: (id: string) => mocks.getInterviewSummary(id),
  getPrivateFileUrl: (bucket: string, objectPath?: string) =>
    mocks.getPrivateFileUrl(bucket, objectPath),
  listInterviewEvents: (id: string) => mocks.listInterviewEvents(id),
  recordingBucketName: () => "interview-recordings",
  resumeBucketName: () => "resumes",
}));

import InterviewDetailPage from "./page";

describe("InterviewDetailPage recording review", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the audio player from a recording_uploaded event when the interview row has no recording path", async () => {
    const interview = makeInterview({ recordingPath: undefined });
    const events: InterviewEvent[] = [
      makeEvent("evt_older", "recording_uploaded", {
        recordingPath: `${interview.id}/older.webm`,
      }),
      makeEvent("evt_latest", "recording_uploaded", {
        recordingPath: `${interview.id}/recording.webm`,
      }),
    ];
    arrangeAuthorizedInterview(interview, events);

    const { container } = render(
      await InterviewDetailPage({
        params: Promise.resolve({ id: interview.id }),
      }),
    );

    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio).toHaveAttribute(
      "src",
      `https://files.example/interview-recordings/${interview.id}/recording.webm`,
    );
    expect(mocks.getPrivateFileUrl).toHaveBeenCalledWith(
      "interview-recordings",
      `${interview.id}/recording.webm`,
    );
  });

  it("prefers the interview recording path over event payloads", async () => {
    const interview = makeInterview({
      recordingPath: `${INTERVIEW_ID}/canonical.webm`,
    });
    arrangeAuthorizedInterview(interview, [
      makeEvent("evt_1", "recording_uploaded", {
        recordingPath: `${interview.id}/fallback.webm`,
      }),
    ]);

    const { container } = render(
      await InterviewDetailPage({
        params: Promise.resolve({ id: interview.id }),
      }),
    );

    expect(container.querySelector("audio")).toHaveAttribute(
      "src",
      `https://files.example/interview-recordings/${interview.id}/canonical.webm`,
    );
    expect(mocks.getPrivateFileUrl).toHaveBeenCalledWith(
      "interview-recordings",
      `${interview.id}/canonical.webm`,
    );
  });

  it("shows an empty recording state when no recording metadata exists", async () => {
    const interview = makeInterview({ recordingPath: undefined });
    arrangeAuthorizedInterview(interview, []);

    const { container } = render(
      await InterviewDetailPage({
        params: Promise.resolve({ id: interview.id }),
      }),
    );

    expect(container.querySelector("audio")).toBeNull();
    expect(screen.getByText("No recording uploaded.")).toBeInTheDocument();
  });
});

const INTERVIEW_ID = "11abce75-ca4e-475d-b9a6-73e6c58d5970";

function arrangeAuthorizedInterview(
  interview: Interview,
  events: InterviewEvent[],
) {
  mocks.getAdminAccessStatus.mockResolvedValue({
    status: "authorized",
    email: "reviewer@example.com",
  });
  mocks.getInterview.mockResolvedValue(interview);
  mocks.listInterviewEvents.mockResolvedValue(events);
  mocks.getInterviewSummary.mockResolvedValue(undefined);
  mocks.getPrivateFileUrl.mockImplementation(
    (bucket: string, objectPath?: string) =>
      objectPath ? `https://files.example/${bucket}/${objectPath}` : undefined,
  );
}

function makeInterview(
  overrides: Partial<Interview> = {},
): Interview {
  return {
    id: INTERVIEW_ID,
    candidateName: "Atoya Smith",
    roleTitle: "Software Engineer",
    level: "L4",
    jobDescription: "Backend systems",
    status: "completed",
    parsedResume: {
      headline: "Backend engineer",
      skills: ["TypeScript"],
      experience: [],
      projects: [],
      education: [],
      highSignalClaims: [],
    },
    completedAt: "2026-05-20T12:00:00.000Z",
    createdAt: "2026-05-20T11:00:00.000Z",
    updatedAt: "2026-05-20T12:00:00.000Z",
    ...overrides,
  };
}

function makeEvent(
  id: string,
  type: string,
  payload?: unknown,
): InterviewEvent {
  return {
    id,
    interviewId: INTERVIEW_ID,
    source: "system",
    type,
    text: undefined,
    payload,
    createdAt: "2026-05-20T12:00:00.000Z",
  };
}
