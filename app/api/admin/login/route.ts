import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  verifyAdminPassphrase,
} from "@/lib/server/security";
import { isProductionRuntime } from "@/lib/server/env";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const passphrase = String(formData.get("passphrase") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin");

  if (!verifyAdminPassphrase(passphrase)) {
    return NextResponse.redirect(new URL("/admin?error=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL(redirectTo, request.url), 303);
  response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionRuntime(),
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
