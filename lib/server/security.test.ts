import { describe, expect, it } from "vitest";
import {
  createAdminSession,
  generateInviteToken,
  hashInviteToken,
  verifyAdminPassphrase,
  verifyAdminSession,
  verifyInviteTokenSignature,
} from "@/lib/server/security";

describe("security helpers", () => {
  it("generates signed invite tokens and hashes them", () => {
    const token = generateInviteToken();

    expect(token).toMatch(/^inv_/);
    expect(verifyInviteTokenSignature(token)).toBe(true);
    expect(hashInviteToken(token)).toHaveLength(64);
  });

  it("rejects tampered invite tokens", () => {
    const token = generateInviteToken();

    expect(verifyInviteTokenSignature(`${token}x`)).toBe(false);
  });

  it("creates and verifies admin sessions", () => {
    const session = createAdminSession();

    expect(verifyAdminSession(session)).toBe(true);
    expect(verifyAdminPassphrase("admin-dev-passphrase")).toBe(true);
    expect(verifyAdminPassphrase("wrong")).toBe(false);
  });
});
