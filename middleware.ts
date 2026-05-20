import { auth0 } from "@/lib/auth0";

// NOTE: Kept as `middleware.ts` (instead of the Next.js 16 `proxy.ts` convention)
// because of a Turbopack bug in Next.js 16.2.x where `proxy.ts` produces an empty
// middleware-manifest.json and never runs on Vercel.
// See: https://github.com/vercel/next.js/issues/93326
export async function middleware(request: Request) {
  return auth0.middleware(request);
}

// Run Auth0 middleware only on routes that actually use the session.
// Candidate routes (/api/interviews/*, /i/*) are protected by their own
// signed cookie and do not need Auth0 session resolution.
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/auth/:path*"],
};
