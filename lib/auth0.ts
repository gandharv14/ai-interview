import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";

export const auth0 = new Auth0Client({
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
