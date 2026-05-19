import "server-only";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSession,
} from "@/lib/server/security";

export async function isAdminSignedIn() {
  const cookieStore = await cookies();
  return verifyAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export function isAdminRequest(request: NextRequest) {
  return verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

export function adminUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
