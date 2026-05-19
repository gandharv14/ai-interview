import { describe, expect, it } from "vitest";
import {
  generateInviteToken,
  hashInviteToken,
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
});
