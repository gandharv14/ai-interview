import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const isAdminRequestMock = vi.fn();

vi.mock("@/lib/server/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/admin")>(
    "@/lib/server/admin",
  );
  return {
    ...actual,
    isAdminRequest: (...args: unknown[]) => isAdminRequestMock(...args),
  };
});

import { POST } from "./route";

beforeEach(() => {
  isAdminRequestMock.mockReset();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRequest(body: unknown | string) {
  return {
    json: async () => {
      if (typeof body === "string") {
        return JSON.parse(body);
      }
      return body;
    },
    nextUrl: { origin: "http://localhost:3000" },
  } as unknown as NextRequest;
}

describe("POST /api/admin/invites", () => {
  it("returns 401 when not signed in", async () => {
    isAdminRequestMock.mockResolvedValue(false);
    const response = await POST(
      makeRequest({
        roleTitle: "Backend",
        level: "L4",
        jobDescription: "",
        expiresInDays: 7,
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 with issues on invalid payload", async () => {
    isAdminRequestMock.mockResolvedValue(true);
    const response = await POST(
      makeRequest({
        roleTitle: "X", // too short
        level: "",
        jobDescription: "",
        expiresInDays: 0, // below min
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid invite payload");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("returns 400 when body is not valid JSON", async () => {
    isAdminRequestMock.mockResolvedValue(true);
    const request = {
      json: async () => {
        throw new SyntaxError("invalid");
      },
      nextUrl: { origin: "http://localhost:3000" },
    } as unknown as NextRequest;
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("creates an invite for valid payload", async () => {
    isAdminRequestMock.mockResolvedValue(true);
    const response = await POST(
      makeRequest({
        roleTitle: "Senior Backend Engineer",
        level: "L5",
        jobDescription: "APIs",
        expiresInDays: 14,
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.inviteUrl).toMatch(/\/i\/inv_/);
  });
});
