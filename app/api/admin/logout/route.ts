import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/auth/logout", request.url), 307);
}

export function POST(request: NextRequest) {
  return NextResponse.redirect(new URL("/auth/logout", request.url), 303);
}
