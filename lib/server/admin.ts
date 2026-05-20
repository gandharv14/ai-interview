import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getOptionalEnv, isProductionRuntime } from "@/lib/server/env";

type SessionLike = Awaited<ReturnType<typeof auth0.getSession>>;

export type AdminAccessStatus =
  | { status: "unauthenticated" }
  | { status: "forbidden"; email?: string; reason: "not_allowlisted" | "email_unverified" | "missing_allowlist" | "missing_email" }
  | { status: "authorized"; email: string };

let warnedAboutMissingAllowlist = false;

function parseAllowlist(): Set<string> {
  const raw = getOptionalEnv("AUTH0_ADMIN_EMAILS");
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function evaluateSession(session: SessionLike): AdminAccessStatus {
  if (!session?.user) return { status: "unauthenticated" };

  const user = session.user as {
    email?: unknown;
    email_verified?: unknown;
  };
  const email =
    typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) return { status: "forbidden", reason: "missing_email" };

  const allowlist = parseAllowlist();
  if (allowlist.size === 0) {
    if (isProductionRuntime()) {
      return { status: "forbidden", email, reason: "missing_allowlist" };
    }
    if (!warnedAboutMissingAllowlist) {
      warnedAboutMissingAllowlist = true;
      console.warn(
        "AUTH0_ADMIN_EMAILS is empty; allowing any signed-in user as admin. " +
          "This is dev/test-only behavior.",
      );
    }
    return { status: "authorized", email };
  }

  if (user.email_verified !== true) {
    return { status: "forbidden", email, reason: "email_unverified" };
  }
  if (!allowlist.has(email)) {
    return { status: "forbidden", email, reason: "not_allowlisted" };
  }
  return { status: "authorized", email };
}

export async function getAdminAccessStatus(
  request?: NextRequest,
): Promise<AdminAccessStatus> {
  const session = request
    ? await auth0.getSession(request)
    : await auth0.getSession();
  return evaluateSession(session);
}

export async function isAdminSignedIn() {
  const result = await getAdminAccessStatus();
  return result.status === "authorized";
}

export async function isAdminRequest(request: NextRequest) {
  const result = await getAdminAccessStatus(request);
  return result.status === "authorized";
}

export function adminUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// Test-only helpers; safe to ship because they only mutate module-local state.
export function __resetAdminWarningStateForTest() {
  warnedAboutMissingAllowlist = false;
}
