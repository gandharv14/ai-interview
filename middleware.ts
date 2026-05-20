import { auth0 } from "@/lib/auth0";
import {
  formatMissingAuth0ConfigMessage,
  getMissingAuth0ConfigKeys,
} from "@/lib/auth0-config";
import { NextResponse } from "next/server";

// NOTE: Kept as `middleware.ts` (instead of the Next.js 16 `proxy.ts` convention)
// because of a Turbopack bug in Next.js 16.2.x where `proxy.ts` produces an empty
// middleware-manifest.json and never runs on Vercel.
// See: https://github.com/vercel/next.js/issues/93326
export async function middleware(request: Request) {
  const missingAuth0Config = getMissingAuth0ConfigKeys();
  if (missingAuth0Config.length > 0) {
    const url = new URL(request.url);
    const message = formatMissingAuth0ConfigMessage(missingAuth0Config);

    if (url.pathname.startsWith("/api/admin")) {
      return NextResponse.json(
        { error: message, missingEnv: missingAuth0Config },
        { status: 503 },
      );
    }

    if (url.pathname === "/auth/error") {
      return NextResponse.next();
    }

    if (url.pathname.startsWith("/auth")) {
      const errorUrl = new URL("/auth/error", request.url);
      errorUrl.searchParams.set("message", message);
      return NextResponse.redirect(errorUrl);
    }

    return NextResponse.next();
  }

  return auth0.middleware(request);
}

// Run Auth0 middleware only on routes that actually use the session.
// Candidate routes (/api/interviews/*, /i/*) are protected by their own
// signed cookie and do not need Auth0 session resolution.
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/auth/:path*"],
};
