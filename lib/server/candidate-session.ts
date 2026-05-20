import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSecretOrDevFallback, isProductionRuntime } from "@/lib/server/env";
import { safeEqual } from "@/lib/server/security";

export const CANDIDATE_SESSION_COOKIE_NAME = "ia_candidate_session";
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

type CandidateSessionPayload = {
  interviewId: string;
  exp: number;
};

function sessionSecret() {
  return getSecretOrDevFallback(
    "INVITE_SIGNING_SECRET",
    "dev-invite-signing-secret",
  );
}

function base64UrlEncode(buffer: Buffer | string) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Buffer | undefined {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return Buffer.from(padded, "base64");
  } catch {
    return undefined;
  }
}

function sign(payloadEncoded: string, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(payloadEncoded)
    .digest("base64url");
}

export function signCandidateSession(
  interviewId: string,
  options: { now?: number; ttlMs?: number } = {},
): string {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  const payload: CandidateSessionPayload = {
    interviewId,
    exp: now + ttlMs,
  };
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadEncoded, sessionSecret());
  return `${payloadEncoded}.${signature}`;
}

type VerifyResult =
  | { ok: true; payload: CandidateSessionPayload }
  | {
      ok: false;
      reason: "missing" | "malformed" | "bad_signature" | "expired" | "wrong_interview";
    };

export function verifyCandidateSession(
  cookieValue: string | undefined,
  interviewId: string,
  now: number = Date.now(),
): VerifyResult {
  if (!cookieValue) return { ok: false, reason: "missing" };
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadEncoded, signature] = parts;
  const expected = sign(payloadEncoded, sessionSecret());
  if (!safeEqual(signature, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  const decoded = base64UrlDecode(payloadEncoded);
  if (!decoded) return { ok: false, reason: "malformed" };
  let payload: CandidateSessionPayload;
  try {
    payload = JSON.parse(decoded.toString("utf8")) as CandidateSessionPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    !payload ||
    typeof payload.interviewId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.exp < now) return { ok: false, reason: "expired" };
  if (payload.interviewId !== interviewId) {
    return { ok: false, reason: "wrong_interview" };
  }
  return { ok: true, payload };
}

export function buildCandidateSessionCookie(
  value: string,
  interviewId: string,
  options: { ttlMs?: number } = {},
): string {
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  const maxAge = Math.floor(ttlMs / 1000);
  const parts = [
    `${CANDIDATE_SESSION_COOKIE_NAME}=${value}`,
    `Path=/api/interviews/${interviewId}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isProductionRuntime()) parts.push("Secure");
  return parts.join("; ");
}

export function readCandidateSessionCookie(request: NextRequest) {
  return request.cookies.get(CANDIDATE_SESSION_COOKIE_NAME)?.value;
}

export function unauthorizedCandidate(reason: string) {
  return NextResponse.json(
    { error: "Candidate session required", reason },
    { status: 401 },
  );
}

export async function requireCandidateSession(
  request: NextRequest,
  interviewId: string,
): Promise<NextResponse | undefined> {
  const cookie = readCandidateSessionCookie(request);
  const result = verifyCandidateSession(cookie, interviewId);
  if (!result.ok) return unauthorizedCandidate(result.reason);
  return undefined;
}
