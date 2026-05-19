import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getOptionalEnv } from "@/lib/server/env";

const SERVICE_ROLE_HELP =
  "SUPABASE_SERVICE_ROLE_KEY must be the service_role JWT from Supabase Dashboard -> Project Settings -> API -> Project API keys -> service_role. Do not set it to the anon key.";

export function getSupabaseAdmin() {
  const url = getOptionalEnv("SUPABASE_URL");
  const serviceRoleKey = getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    return undefined;
  }

  assertServiceRoleKey(serviceRoleKey);

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function assertServiceRoleKey(serviceRoleKey: string) {
  const role = decodeJwtRole(serviceRoleKey);
  if (role === "service_role") return;
  if (!role) {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY is not a valid JWT. ${SERVICE_ROLE_HELP}`,
    );
  }
  throw new Error(
    `SUPABASE_SERVICE_ROLE_KEY has role "${role}" but service_role is required (server-side uploads bypass RLS only with the service_role key). ${SERVICE_ROLE_HELP}`,
  );
}

export function decodeJwtRole(token: string): string | undefined {
  const segments = token.split(".");
  if (segments.length < 2) return undefined;
  const payload = decodeJwtSegment(segments[1]);
  if (!payload) return undefined;
  const role = (payload as { role?: unknown }).role;
  return typeof role === "string" ? role : undefined;
}

function decodeJwtSegment(segment: string): Record<string, unknown> | undefined {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
