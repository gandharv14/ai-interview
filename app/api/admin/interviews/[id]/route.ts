import { NextRequest, NextResponse } from "next/server";
import { adminUnauthorized, isAdminRequest } from "@/lib/server/admin";
import { deleteInterview } from "@/lib/server/store";
import { getDatabaseSetupIssue } from "@/lib/server/store-setup";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!(await isAdminRequest(request))) return adminUnauthorized();

  const { id } = await context.params;
  let deleted;
  try {
    deleted = await deleteInterview(id);
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

  if (!deleted) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
