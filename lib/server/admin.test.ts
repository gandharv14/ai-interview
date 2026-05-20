import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();

vi.mock("@/lib/auth0", () => ({
  auth0: {
    getSession: (...args: unknown[]) => getSessionMock(...args),
  },
}));

import {
  __resetAdminWarningStateForTest,
  getAdminAccessStatus,
  isAdminRequest,
  isAdminSignedIn,
} from "@/lib/server/admin";
import type { NextRequest } from "next/server";

beforeEach(() => {
  getSessionMock.mockReset();
  delete process.env.AUTH0_ADMIN_EMAILS;
  delete process.env.NODE_ENV;
  delete process.env.VERCEL;
  __resetAdminWarningStateForTest();
});

afterEach(() => {
  getSessionMock.mockReset();
});

describe("isAdminSignedIn", () => {
  it("reports missing Auth0 config without reading the session", async () => {
    delete process.env.AUTH0_DOMAIN;
    getSessionMock.mockResolvedValue({
      user: { email: "admin@example.com", email_verified: true },
    });

    await expect(getAdminAccessStatus()).resolves.toMatchObject({
      status: "forbidden",
      reason: "missing_auth0_config",
      missingEnv: ["AUTH0_DOMAIN"],
    });
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("returns false when there is no session", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(isAdminSignedIn()).resolves.toBe(false);
  });

  it("returns false in production when allowlist is unset", async () => {
    process.env.NODE_ENV = "production";
    getSessionMock.mockResolvedValue({
      user: { email: "anyone@example.com", email_verified: true },
    });
    await expect(isAdminSignedIn()).resolves.toBe(false);
  });

  it("falls back to dev mode when allowlist is unset and not in production", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getSessionMock.mockResolvedValue({
      user: { email: "anyone@example.com", email_verified: true },
    });
    try {
      await expect(isAdminSignedIn()).resolves.toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      // Subsequent call still returns true but does not re-warn.
      await expect(isAdminSignedIn()).resolves.toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("matches the allowlist case-insensitively and trims whitespace", async () => {
    process.env.AUTH0_ADMIN_EMAILS = "  Admin@Example.com  , other@x.com";
    getSessionMock.mockResolvedValue({
      user: { email: "ADMIN@example.COM", email_verified: true },
    });
    await expect(isAdminSignedIn()).resolves.toBe(true);
  });

  it("rejects unverified emails even when allowlisted", async () => {
    process.env.AUTH0_ADMIN_EMAILS = "admin@example.com";
    getSessionMock.mockResolvedValue({
      user: { email: "admin@example.com", email_verified: false },
    });
    await expect(isAdminSignedIn()).resolves.toBe(false);
  });

  it("rejects emails not on the allowlist", async () => {
    process.env.AUTH0_ADMIN_EMAILS = "admin@example.com";
    getSessionMock.mockResolvedValue({
      user: { email: "stranger@example.com", email_verified: true },
    });
    await expect(isAdminSignedIn()).resolves.toBe(false);
  });

  it("rejects sessions without an email", async () => {
    process.env.AUTH0_ADMIN_EMAILS = "admin@example.com";
    getSessionMock.mockResolvedValue({
      user: { email_verified: true },
    });
    await expect(isAdminSignedIn()).resolves.toBe(false);
  });
});

describe("isAdminRequest", () => {
  it("forwards the request to auth0.getSession", async () => {
    process.env.AUTH0_ADMIN_EMAILS = "admin@example.com";
    getSessionMock.mockResolvedValue({
      user: { email: "admin@example.com", email_verified: true },
    });
    const request = { nextUrl: { searchParams: new URLSearchParams() } } as unknown as NextRequest;
    await expect(isAdminRequest(request)).resolves.toBe(true);
    expect(getSessionMock).toHaveBeenCalledWith(request);
  });
});
