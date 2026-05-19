import "server-only";

import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { getSecretOrDevFallback } from "@/lib/server/env";

const INVITE_TOKEN_PREFIX = "inv";

function hmac(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function inviteSecret() {
  return getSecretOrDevFallback(
    "INVITE_SIGNING_SECRET",
    "dev-invite-signing-secret",
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
