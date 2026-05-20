export const MAX_RECORDING_BYTES = 200 * 1024 * 1024;

const ALLOWED_RECORDING_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/x-m4a",
  "audio/mp3",
  "video/webm", // browsers sometimes label webm/opus as video/webm
]);

const ALLOWED_RECORDING_EXTENSIONS = new Set([
  "webm",
  "mp4",
  "m4a",
  "mp3",
  "wav",
  "mpeg",
]);

export function normalizeRecordingMimeType(contentType: string) {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAllowedRecordingMimeType(contentType: string) {
  const mimeType = normalizeRecordingMimeType(contentType);
  return !mimeType || ALLOWED_RECORDING_MIME_TYPES.has(mimeType);
}

export function recordingExtensionFromFilename(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_RECORDING_EXTENSIONS.has(extension) ? extension : "webm";
}

export function isValidRecordingPath(interviewId: string, recordingPath: string) {
  if (!recordingPath.startsWith(`${interviewId}/recording.`)) return false;
  const extension = recordingPath.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_RECORDING_EXTENSIONS.has(extension);
}
