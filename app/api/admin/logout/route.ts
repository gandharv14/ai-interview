import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/server/security";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
