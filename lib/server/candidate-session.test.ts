import { describe, expect, it } from "vitest";
import {
  buildCandidateSessionCookie,
  CANDIDATE_SESSION_COOKIE_NAME,
  signCandidateSession,
  verifyCandidateSession,
} from "@/lib/server/candidate-session";

describe("candidate session", () => {
  it("signs and verifies a session round-trip", () => {
    const token = signCandidateSession("interview-123");
    const result = verifyCandidateSession(token, "interview-123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.interviewId).toBe("interview-123");
      expect(result.payload.exp).toBeGreaterThan(Date.now());
    }
  });

  it("rejects when the cookie is missing", () => {
    const result = verifyCandidateSession(undefined, "interview-123");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing");
  });

  it("rejects malformed cookies", () => {
    const result = verifyCandidateSession("not-a-cookie", "interview-123");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("rejects tampered signatures", () => {
    const token = signCandidateSession("interview-123");
    const [payload] = token.split(".");
    const result = verifyCandidateSession(
      `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
      "interview-123",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects expired tokens", () => {
    const token = signCandidateSession("interview-123", {
      now: Date.now() - 10_000,
      ttlMs: 1_000,
    });
    const result = verifyCandidateSession(token, "interview-123");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects when interviewId does not match", () => {
    const token = signCandidateSession("interview-123");
    const result = verifyCandidateSession(token, "interview-456");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong_interview");
  });

  it("builds a cookie scoped to the interview path", () => {
    const cookie = buildCandidateSessionCookie("token", "abc");
    expect(cookie).toContain(`${CANDIDATE_SESSION_COOKIE_NAME}=token`);
    expect(cookie).toContain("Path=/api/interviews/abc");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=");
  });

  it("adds Secure in production", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const cookie = buildCandidateSessionCookie("token", "abc");
      expect(cookie).toContain("Secure");
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previous;
      }
    }
  });

  it("does not add Secure outside production", () => {
    delete process.env.NODE_ENV;
    delete process.env.VERCEL;
    const cookie = buildCandidateSessionCookie("token", "abc");
    expect(cookie).not.toContain("Secure");
  });
});
