import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getOptionalEnv, isProductionRuntime } from "@/lib/server/env";

type SessionLike = Awaited<ReturnType<typeof auth0.getSession>>;

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

function sessionPasses(session: SessionLike): boolean {
  if (!session?.user) return false;

  const user = session.user as {
    email?: unknown;
    email_verified?: unknown;
  };
  const email =
    typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) return false;

  const allowlist = parseAllowlist();
  if (allowlist.size === 0) {
    if (isProductionRuntime()) return false;
    if (!warnedAboutMissingAllowlist) {
      warnedAboutMissingAllowlist = true;
      console.warn(
        "AUTH0_ADMIN_EMAILS is empty; allowing any signed-in user as admin. " +
          "This is dev/test-only behavior.",
      );
    }
    return true;
  }

  if (user.email_verified !== true) return false;
  return allowlist.has(email);
}

export async function isAdminSignedIn() {
  const session = await auth0.getSession();
  return sessionPasses(session);
}

export async function isAdminRequest(request: NextRequest) {
  const session = await auth0.getSession(request);
  return sessionPasses(session);
}

export function adminUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// Test-only helpers; safe to ship because they only mutate module-local state.
export function __resetAdminWarningStateForTest() {
  warnedAboutMissingAllowlist = false;
}
