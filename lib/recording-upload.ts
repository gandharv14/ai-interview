type RecordingUploadUrlResponse = {
  recordingPath?: string;
  signedUrl?: string;
  error?: string;
};

type RecordingCompleteResponse = {
  recordingPath?: string;
  error?: string;
};

type UploadOptions = {
  fetch?: typeof fetch;
};

const DIRECT_UPLOAD_FALLBACK_STATUSES = new Set([404, 405, 501]);
const DIRECT_UPLOAD_TERMINAL_STATUSES = new Set([400, 401, 403, 413, 415]);

class TerminalRecordingUploadError extends Error {}

export async function uploadRecordingBlobForReview(
  interviewId: string,
  recording: Blob,
  options: UploadOptions = {},
) {
  return uploadRecordingFileForReview(
    interviewId,
    new File([recording], "interview.webm", {
      type: recording.type || "audio/webm",
    }),
    options,
  );
}

export async function uploadRecordingFileForReview(
  interviewId: string,
  file: File,
  options: UploadOptions = {},
) {
  if (file.size <= 0) {
    throw new Error("Recording did not capture audio. Please try again.");
  }

  const fetchImpl = options.fetch ?? fetch;
  const directResult = await tryDirectRecordingUpload(
    interviewId,
    file,
    fetchImpl,
  );
  if (directResult.recordingPath) return directResult.recordingPath;

  return uploadRecordingThroughAppRoute(interviewId, file, fetchImpl);
}

async function tryDirectRecordingUpload(
  interviewId: string,
  file: File,
  fetchImpl: typeof fetch,
) {
  let uploadUrlResponse: Response;
  try {
    uploadUrlResponse = await fetchImpl(
      `/api/interviews/${interviewId}/recording/upload-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
        credentials: "same-origin",
      },
    );
  } catch {
    return {};
  }

  if (DIRECT_UPLOAD_FALLBACK_STATUSES.has(uploadUrlResponse.status)) return {};

  const uploadUrlData =
    await readJsonResponse<RecordingUploadUrlResponse>(uploadUrlResponse);
  if (!uploadUrlResponse.ok) {
    if (DIRECT_UPLOAD_TERMINAL_STATUSES.has(uploadUrlResponse.status)) {
      throw new Error(uploadUrlData.error || "Could not prepare recording upload");
    }
    return {};
  }
  if (!uploadUrlData.signedUrl || !uploadUrlData.recordingPath) return {};

  try {
    await uploadFileToSignedUrl(uploadUrlData.signedUrl, file, fetchImpl);
    const complete = await fetchImpl(
      `/api/interviews/${interviewId}/recording/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingPath: uploadUrlData.recordingPath,
          contentType: file.type,
          size: file.size,
        }),
        credentials: "same-origin",
      },
    );
    const completeData =
      await readJsonResponse<RecordingCompleteResponse>(complete);
    if (!complete.ok) {
      if (DIRECT_UPLOAD_TERMINAL_STATUSES.has(complete.status)) {
        throw new TerminalRecordingUploadError(
          completeData.error || "Could not save recording metadata",
        );
      }
      return {};
    }
    return {
      recordingPath: completeData.recordingPath ?? uploadUrlData.recordingPath,
    };
  } catch (error) {
    if (error instanceof TerminalRecordingUploadError) {
      throw error;
    }
    return {};
  }
}

async function uploadRecordingThroughAppRoute(
  interviewId: string,
  file: File,
  fetchImpl: typeof fetch,
) {
  const formData = new FormData();
  formData.set("recording", file);
  const upload = await fetchImpl(`/api/interviews/${interviewId}/recording`, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  });
  const data = await readJsonResponse<RecordingCompleteResponse>(upload);
  if (!upload.ok) {
    throw new Error(data.error || "Recording upload failed");
  }
  if (!data.recordingPath) {
    throw new Error("Recording upload succeeded without a saved file path");
  }
  return data.recordingPath;
}

async function uploadFileToSignedUrl(
  signedUrl: string,
  file: File,
  fetchImpl: typeof fetch,
) {
  const formData = new FormData();
  formData.append("cacheControl", "3600");
  formData.append("", file);
  const response = await fetchImpl(signedUrl, {
    method: "PUT",
    body: formData,
  });
  if (!response.ok) {
    throw new Error("Recording upload to storage failed");
  }
}

async function readJsonResponse<T>(
  response: Response,
): Promise<T & { error?: string }> {
  const text = await response.text();
  if (!text.trim()) {
    if (response.ok) {
      return {} as T & { error?: string };
    }
    return {
      error: `Request failed with status ${response.status}`,
    } as T & { error?: string };
  }

  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    if (!response.ok) {
      return {
        error: `Request failed with status ${response.status}`,
      } as T & { error?: string };
    }
    return {} as T & { error?: string };
  }
}

