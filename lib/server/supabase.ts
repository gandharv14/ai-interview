import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getOptionalEnv } from "@/lib/server/env";

const SERVICE_ROLE_HELP =
  "SUPABASE_SERVICE_ROLE_KEY must be the service_role JWT from Supabase Dashboard -> Project Settings -> API -> Project API keys -> service_role. Do not set it to the anon key.";

let warnedAboutLocalDotEnvOverride = false;

export function getSupabaseAdmin() {
  const url = getOptionalEnv("SUPABASE_URL");
  const serviceRoleKey = resolveSupabaseServiceRoleKey();
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

export function resolveSupabaseServiceRoleKey(
  readLocalDotEnv: (name: string) => string | undefined = readLocalDotEnvValue,
) {
  const serviceRoleKey = getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (decodeJwtRole(serviceRoleKey ?? "") === "service_role") {
    return serviceRoleKey;
  }

  if (!shouldReadLocalDotEnv()) return serviceRoleKey;

  const localServiceRoleKey = readLocalDotEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (decodeJwtRole(localServiceRoleKey ?? "") !== "service_role") {
    return serviceRoleKey;
  }

  if (!warnedAboutLocalDotEnvOverride) {
    warnedAboutLocalDotEnvOverride = true;
    console.warn(
      "Using SUPABASE_SERVICE_ROLE_KEY from local dotenv because the running " +
        "development environment does not contain a service_role key. Restart " +
        "the dev server after editing dotenv files so Next.js reloads environment values.",
    );
  }
  return localServiceRoleKey;
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

function shouldReadLocalDotEnv() {
  return process.env.NODE_ENV === "development" && process.env.VERCEL !== "1";
}

function readLocalDotEnvValue(name: string) {
  for (const filename of [
    ".env.development.local",
    ".env.local",
    ".env.development",
    ".env",
  ]) {
    const filePath = join(process.cwd(), filename);
    if (!existsSync(filePath)) continue;
    const value = parseDotEnvValue(readFileSync(filePath, "utf8"), name);
    if (value !== undefined) return value;
  }
  return undefined;
}

function parseDotEnvValue(contents: string, name: string) {
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match || match[1] !== name) continue;

    let value = match[2]?.trim() ?? "";
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    } else if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith("`") && value.endsWith("`"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    return value;
  }
  return undefined;
}
