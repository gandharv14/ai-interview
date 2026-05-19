import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function isAdminSignedIn() {
  const session = await auth0.getSession();
  return Boolean(session?.user);
}

export async function isAdminRequest(request: NextRequest) {
  const session = await auth0.getSession(request);
  return Boolean(session?.user);
}

export function adminUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
