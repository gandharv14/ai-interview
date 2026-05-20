import { NextRequest, NextResponse } from "next/server";
import { adminUnauthorized, isAdminRequest } from "@/lib/server/admin";
import { listInterviews } from "@/lib/server/store";
import { getDatabaseSetupIssue } from "@/lib/server/store-setup";

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return adminUnauthorized();
  let interviews;
  try {
    interviews = await listInterviews();
  } catch (error) {
    const setupIssue = getDatabaseSetupIssue(error);
    if (setupIssue) {
      return NextResponse.json(
        {
          error: setupIssue.message,
          detail: setupIssue.detail,
          setupIssue,
        },
        { status: 503 },
      );
    }
    throw error;
  }
  return NextResponse.json({ interviews });
}
