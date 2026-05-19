import "server-only";

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function getRealtimeModel() {
  return process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2";
}

export function getTextModel() {
  return process.env.OPENAI_TEXT_MODEL ?? "gpt-5.5";
}

export function getTranscribeModel() {
  return process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-transcribe-diarize";
}

export function getOptionalEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

export function getRequiredEnv(name: string) {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getSecretOrDevFallback(name: string, fallback: string) {
  const value = getOptionalEnv(name);
  if (value) return value;
  if (isProductionRuntime()) {
    throw new Error(`${name} is required in production`);
  }
  return fallback;
}

export function hasSupabaseConfig() {
  return Boolean(
    getOptionalEnv("SUPABASE_URL") &&
      getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}
