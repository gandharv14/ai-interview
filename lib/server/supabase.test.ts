import { afterEach, describe, expect, it } from "vitest";
import {
  assertServiceRoleKey,
  decodeJwtRole,
  getSupabaseAdmin,
  resolveSupabaseServiceRoleKey,
} from "@/lib/server/supabase";

function base64UrlJson(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fakeJwt(payload: Record<string, unknown>) {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const body = base64UrlJson(payload);
  return `${header}.${body}.signature-not-validated`;
}

describe("supabase admin client", () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VERCEL;
  });

  it("returns undefined when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(getSupabaseAdmin()).toBeUndefined();

    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(getSupabaseAdmin()).toBeUndefined();

    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = fakeJwt({ role: "service_role" });
    expect(getSupabaseAdmin()).toBeUndefined();
  });

  it("constructs a client when SUPABASE_SERVICE_ROLE_KEY is a service_role JWT", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = fakeJwt({ role: "service_role" });
    const client = getSupabaseAdmin();
    expect(client).toBeDefined();
    expect(client?.storage).toBeDefined();
  });

  it("throws an actionable error when SUPABASE_SERVICE_ROLE_KEY is the anon JWT", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = fakeJwt({ role: "anon" });
    expect(() => getSupabaseAdmin()).toThrowError(
      /role "anon".*service_role.*Project Settings/s,
    );
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is not a JWT at all", () => {
    expect(() => assertServiceRoleKey("not-a-jwt")).toThrowError(
      /not a valid JWT.*service_role/s,
    );
  });

  it("decodeJwtRole returns the role claim", () => {
    expect(decodeJwtRole(fakeJwt({ role: "service_role" }))).toBe(
      "service_role",
    );
    expect(decodeJwtRole(fakeJwt({ role: "anon" }))).toBe("anon");
    expect(decodeJwtRole("garbage")).toBeUndefined();
  });

  it("uses the local dotenv service role in development when the process has anon", () => {
    const localServiceRoleKey = fakeJwt({ role: "service_role" });
    process.env.NODE_ENV = "development";
    process.env.SUPABASE_SERVICE_ROLE_KEY = fakeJwt({ role: "anon" });

    expect(resolveSupabaseServiceRoleKey(() => localServiceRoleKey)).toBe(
      localServiceRoleKey,
    );
  });

  it("does not override an invalid process key in production", () => {
    const inheritedAnonKey = fakeJwt({ role: "anon" });
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_SERVICE_ROLE_KEY = inheritedAnonKey;

    expect(
      resolveSupabaseServiceRoleKey(() => fakeJwt({ role: "service_role" })),
    ).toBe(inheritedAnonKey);
  });
});
