import "server-only";

import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { getSecretOrDevFallback } from "@/lib/server/env";

const INVITE_TOKEN_PREFIX = "inv";
export const ADMIN_SESSION_COOKIE = "interview_agent_admin";

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function hmac(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function inviteSecret() {
  return getSecretOrDevFallback(
    "INVITE_SIGNING_SECRET",
    "dev-invite-signing-secret",
  );
}

function adminSecret() {
  return getSecretOrDevFallback(
    "ADMIN_SESSION_SECRET",
    "dev-admin-session-secret",
  );
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken() {
  const raw = `${INVITE_TOKEN_PREFIX}_${nanoid(32)}`;
  const signature = hmac(raw, inviteSecret()).slice(0, 32);
  return `${raw}.${signature}`;
}

export function verifyInviteTokenSignature(token: string) {
  const [raw, signature] = token.split(".");
  if (!raw || !signature || !raw.startsWith(`${INVITE_TOKEN_PREFIX}_`)) {
    return false;
  }
  const expected = hmac(raw, inviteSecret()).slice(0, 32);
  return safeEqual(signature, expected);
}

export function createAdminSession(maxAgeSeconds = 60 * 60 * 8) {
  const payload = base64url(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
    }),
  );
  return `${payload}.${hmac(payload, adminSecret())}`;
}

export function verifyAdminSession(session?: string) {
  if (!session) return false;
  const [payload, signature] = session.split(".");
  if (!payload || !signature) return false;
  const expected = hmac(payload, adminSecret());
  if (!safeEqual(signature, expected)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof parsed.exp === "number" && parsed.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function verifyAdminPassphrase(passphrase: string) {
  const expected = getSecretOrDevFallback(
    "ADMIN_PASSPHRASE",
    "admin-dev-passphrase",
  );
  return safeEqual(passphrase, expected);
}
