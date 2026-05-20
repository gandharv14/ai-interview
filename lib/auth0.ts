import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";

let cachedClient: Auth0Client | undefined;

function buildClient() {
  return new Auth0Client({
    signInReturnToPath: "/admin",
    enableAccessTokenEndpoint: false,
    async onCallback(error, ctx) {
      if (error) {
        const errorUrl = new URL(
          "/auth/error",
          ctx.appBaseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000",
        );
        errorUrl.searchParams.set("message", error.message);
        return NextResponse.redirect(errorUrl);
      }

      const appBaseUrl =
        ctx.appBaseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
      return NextResponse.redirect(new URL(ctx.returnTo ?? "/", appBaseUrl));
    },
  });
}

function resolveClient(): Auth0Client {
  if (!cachedClient) {
    cachedClient = buildClient();
  }
  return cachedClient;
}

// A Proxy so existing call sites like `auth0.getSession()` keep working
// without each call having to call `getAuth0()` first. The construction is
// deferred until the first property access.
export const auth0: Auth0Client = new Proxy({} as Auth0Client, {
  get(_target, property) {
    const client = resolveClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[
      property as string
    ];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});

export function getAuth0(): Auth0Client {
  return resolveClient();
}

// Test-only escape hatch.
export function __resetAuth0ClientForTest() {
  cachedClient = undefined;
}
