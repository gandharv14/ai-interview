import { NextRequest, NextResponse } from "next/server";

function safeReturnTo(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/admin";
}

export function GET(request: NextRequest) {
  const returnTo = safeReturnTo(
    request.nextUrl.searchParams.get("returnTo") ?? "/admin",
  );
  const loginUrl = new URL("/auth/login", request.url);
  loginUrl.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(loginUrl, 307);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const returnTo = safeReturnTo(String(formData.get("redirectTo") ?? "/admin"));
  const loginUrl = new URL("/auth/login", request.url);
  loginUrl.searchParams.set("returnTo", returnTo);

  return NextResponse.redirect(loginUrl, 303);
}
