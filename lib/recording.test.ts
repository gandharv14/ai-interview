import { describe, expect, it } from "vitest";
import {
  isAllowedRecordingMimeType,
  isValidRecordingPath,
  normalizeRecordingMimeType,
  recordingExtensionFromFilename,
  recordingObjectPath,
} from "@/lib/recording";

describe("recording helpers", () => {
  it("normalizes browser MIME type parameters", () => {
    expect(normalizeRecordingMimeType("Audio/WebM;codecs=opus")).toBe(
      "audio/webm",
    );
    expect(isAllowedRecordingMimeType("audio/webm;codecs=opus")).toBe(true);
  });

  it("rejects unsupported recording MIME types", () => {
    expect(isAllowedRecordingMimeType("application/octet-stream")).toBe(false);
  });

  it("uses a safe extension fallback for unknown or path-like filenames", () => {
    expect(recordingExtensionFromFilename("interview.audio.mp3")).toBe("mp3");
    expect(recordingExtensionFromFilename("../recording.exe")).toBe("webm");
    expect(recordingExtensionFromFilename("nested/path/recording.wav")).toBe(
      "wav",
    );
  });

  it("builds canonical recording object paths", () => {
    expect(recordingObjectPath("int_1", "mp3")).toBe("int_1/recording.mp3");
    expect(recordingObjectPath("int_1", "exe")).toBe("int_1/recording.webm");
  });

  it("validates exact recording object paths for the interview only", () => {
    expect(isValidRecordingPath("int_1", "int_1/recording.webm")).toBe(true);
    expect(isValidRecordingPath("int_1", "int_2/recording.webm")).toBe(false);
    expect(isValidRecordingPath("int_1", "int_1/transcript.webm")).toBe(false);
    expect(isValidRecordingPath("int_1", "int_1/recording.webm/evil.mp3")).toBe(
      false,
    );
    expect(isValidRecordingPath("int_1", "int_1/recording.exe")).toBe(false);
  });
});
