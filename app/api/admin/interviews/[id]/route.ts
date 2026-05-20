import { NextRequest, NextResponse } from "next/server";
import {
  adminUnauthorized,
  getAdminAccessStatus,
  isAdminRequest,
} from "@/lib/server/admin";
import { adminInterviewReviewActionSchema } from "@/lib/schemas";
import {
  deleteInterview,
  reserveInterviewForReviewer,
  submitInterviewDecision,
  type ReviewActionFailureReason,
  type ReviewActionResult,
} from "@/lib/server/store";
import { getDatabaseSetupIssue } from "@/lib/server/store-setup";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const access = await getAdminAccessStatus(request);
  if (access.status !== "authorized") return adminUnauthorized();

  let input;
  try {
    input = adminInterviewReviewActionSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid review action" }, { status: 400 });
  }

  const { id } = await context.params;
  let result: ReviewActionResult;
  try {
    result =
      input.action === "reserve"
        ? await reserveInterviewForReviewer(id, access.email)
        : await submitInterviewDecision(id, access.email, input.decision);
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
    console.error("Admin review action failed", error);
    return NextResponse.json(
      { error: "Could not update review status" },
      { status: 500 },
    );
  }

  if (result.ok) {
    return NextResponse.json({ interview: result.interview });
  }
  return NextResponse.json(
    {
      error: reviewActionErrorMessage(result.reason),
      reason: result.reason,
      interview: result.interview,
    },
    { status: reviewActionStatus(result.reason) },
  );
}

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

function reviewActionStatus(reason: ReviewActionFailureReason) {
  if (reason === "not_found") return 404;
  if (reason === "not_completed") return 400;
  return 409;
}

function reviewActionErrorMessage(reason: ReviewActionFailureReason) {
  switch (reason) {
    case "not_found":
      return "Interview not found";
    case "not_completed":
      return "Interview must be completed before review";
    case "already_decided":
      return "Interview already has a pass/fail decision";
    case "already_reserved":
      return "Interview is already reserved by another reviewer";
    case "reserved_by_other":
      return "Interview is reserved by another reviewer";
    case "reservation_required":
      return "Reserve the interview before submitting a decision";
  }
}
