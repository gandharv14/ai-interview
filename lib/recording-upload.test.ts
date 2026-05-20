import { describe, expect, it, vi } from "vitest";
import {
  uploadRecordingBlobForReview,
  uploadRecordingFileForReview,
} from "@/lib/recording-upload";

describe("uploadRecordingFileForReview", () => {
  it("uploads directly to signed storage and confirms metadata", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/recording/upload-url")) {
        return jsonResponse({
          signedUrl: "https://storage.example/upload",
          recordingPath: "int_1/recording.webm",
        });
      }
      if (url === "https://storage.example/upload") {
        return jsonResponse({});
      }
      if (url.endsWith("/recording/complete")) {
        return jsonResponse({ recordingPath: "int_1/recording.webm" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    await expect(
      uploadRecordingFileForReview("int_1", makeFile(), { fetch: fetchMock }),
    ).resolves.toBe("int_1/recording.webm");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/interviews/int_1/recording/upload-url",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://storage.example/upload",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/interviews/int_1/recording/complete",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    );
  });

  it("wraps blobs in an interview.webm file for upload", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/recording/upload-url")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          filename: "interview.webm",
          contentType: "audio/webm",
        });
        return new Response("", { status: 501 });
      }
      return jsonResponse({ recordingPath: "int_1/recording.webm" });
    });

    await expect(
      uploadRecordingBlobForReview(
        "int_1",
        new Blob(["audio"], { type: "audio/webm" }),
        { fetch: fetchMock },
      ),
    ).resolves.toBe("int_1/recording.webm");
  });

  it("falls back to the app route when direct upload is unavailable", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/recording/upload-url")) {
        return new Response("", { status: 501 });
      }
      if (String(input).endsWith("/recording")) {
        return jsonResponse({ recordingPath: "int_1/recording.webm" });
      }
      throw new Error(`unexpected fetch ${String(input)}`);
    });

    await expect(
      uploadRecordingFileForReview("int_1", makeFile(), { fetch: fetchMock }),
    ).resolves.toBe("int_1/recording.webm");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the app route when direct upload preparation fails transiently", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(jsonResponse({ recordingPath: "int_1/recording.webm" }));

    await expect(
      uploadRecordingFileForReview("int_1", makeFile(), { fetch: fetchMock }),
    ).resolves.toBe("int_1/recording.webm");
  });

  it("does not fall back when the backend rejects invalid recording metadata", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: "Unsupported recording content type: text/plain" }, 415),
    );

    await expect(
      uploadRecordingFileForReview("int_1", makeFile("text/plain"), {
        fetch: fetchMock,
      }),
    ).rejects.toThrow("Unsupported recording content type");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back if signed storage upload fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/recording/upload-url")) {
        return jsonResponse({
          signedUrl: "https://storage.example/upload",
          recordingPath: "int_1/recording.webm",
        });
      }
      if (url === "https://storage.example/upload") {
        return new Response("", { status: 403 });
      }
      if (url.endsWith("/recording")) {
        return jsonResponse({ recordingPath: "int_1/recording.webm" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    await expect(
      uploadRecordingFileForReview("int_1", makeFile(), { fetch: fetchMock }),
    ).resolves.toBe("int_1/recording.webm");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back if metadata confirmation fails with a retryable server error", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/recording/upload-url")) {
        return jsonResponse({
          signedUrl: "https://storage.example/upload",
          recordingPath: "int_1/recording.webm",
        });
      }
      if (url === "https://storage.example/upload") return jsonResponse({});
      if (url.endsWith("/recording/complete")) {
        return jsonResponse({ error: "temporary" }, 503);
      }
      if (url.endsWith("/recording")) {
        return jsonResponse({ recordingPath: "int_1/recording.webm" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    await expect(
      uploadRecordingFileForReview("int_1", makeFile(), { fetch: fetchMock }),
    ).resolves.toBe("int_1/recording.webm");
  });

  it("throws terminal metadata confirmation failures without fallback", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/recording/upload-url")) {
        return jsonResponse({
          signedUrl: "https://storage.example/upload",
          recordingPath: "int_1/recording.webm",
        });
      }
      if (url === "https://storage.example/upload") return jsonResponse({});
      return jsonResponse({ error: "Invalid recording path" }, 400);
    });

    await expect(
      uploadRecordingFileForReview("int_1", makeFile(), { fetch: fetchMock }),
    ).rejects.toThrow("Invalid recording path");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces app route fallback errors", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/recording/upload-url")) {
        return new Response("", { status: 501 });
      }
      return jsonResponse({ error: "Recording exceeds the 200MB limit" }, 413);
    });

    await expect(
      uploadRecordingFileForReview("int_1", makeFile(), { fetch: fetchMock }),
    ).rejects.toThrow("Recording exceeds the 200MB limit");
  });

  it("rejects empty recordings before making network requests", async () => {
    const fetchMock = vi.fn();

    await expect(
      uploadRecordingFileForReview(
        "int_1",
        new File([], "empty.webm", { type: "audio/webm" }),
        { fetch: fetchMock },
      ),
    ).rejects.toThrow("Recording did not capture audio");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function makeFile(type = "audio/webm") {
  return new File(["audio"], "interview.webm", { type });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
