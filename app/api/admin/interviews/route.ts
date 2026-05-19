import { NextRequest, NextResponse } from "next/server";
import { adminUnauthorized, isAdminRequest } from "@/lib/server/admin";
import { listInterviews } from "@/lib/server/store";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return adminUnauthorized();
  const interviews = await listInterviews();
  return NextResponse.json({ interviews });
}
