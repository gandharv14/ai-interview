"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LockKeyhole, XCircle } from "lucide-react";
import type { Interview, ReviewDecision } from "@/lib/types";

type Props = {
  initialInterview: Interview;
  reviewerEmail: string;
};

export function InterviewReviewActions({
  initialInterview,
  reviewerEmail,
}: Props) {
  const router = useRouter();
  const [interview, setInterview] = useState(initialInterview);
  const [busyAction, setBusyAction] = useState<"reserve" | ReviewDecision | null>(
    null,
  );
  const [error, setError] = useState("");
  const reservedByCurrentReviewer =
    interview.reservedByEmail?.toLowerCase() === reviewerEmail.toLowerCase();
  const canReserve =
    interview.status === "completed" &&
    !interview.reviewDecision &&
    !interview.reservedByEmail;
  const canDecide =
    interview.status === "completed" &&
    !interview.reviewDecision &&
    reservedByCurrentReviewer;

  async function sendReviewAction(
    action: "reserve" | "decision",
    decision?: ReviewDecision,
  ) {
    const pendingAction = action === "reserve" ? action : decision;
    if (!pendingAction) return;
    setBusyAction(pendingAction);
    setError("");
    try {
      const response = await fetch(`/api/admin/interviews/${interview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "reserve" ? { action } : { action, decision },
        ),
      });
      const data = await readReviewResponse(response);
      if (!response.ok) {
        if (data.interview) setInterview(data.interview);
        throw new Error(data.error || "Could not update review status");
      }
      if (data.interview) setInterview(data.interview);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update review status",
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <article className="panel p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="rounded-full border border-border bg-panel-subtle p-2">
          <LockKeyhole size={18} aria-hidden />
        </span>
        <div>
          <h2 className="section-title">Human Review</h2>
          <p className="muted mt-1 text-sm">
            Reserve this interview before submitting a pass/fail decision.
          </p>
        </div>
      </div>

      <ReviewStateSummary
        interview={interview}
        reviewerEmail={reviewerEmail}
      />

      {error ? <p className="mt-3 text-sm font-bold text-foreground">{error}</p> : null}

      {!interview.reviewDecision ? (
        <div className="mt-4 grid gap-3">
          <button
            className="button button-primary w-fit"
            type="button"
            onClick={() => void sendReviewAction("reserve")}
            disabled={!canReserve || busyAction !== null}
          >
            <LockKeyhole size={17} aria-hidden />
            {busyAction === "reserve" ? "Reserving" : "Reserve interview"}
          </button>

          <div className="flex flex-wrap gap-2">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void sendReviewAction("decision", "pass")}
              disabled={!canDecide || busyAction !== null}
            >
              <CheckCircle2 size={17} aria-hidden />
              {busyAction === "pass" ? "Submitting" : "Pass"}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void sendReviewAction("decision", "fail")}
              disabled={!canDecide || busyAction !== null}
            >
              <XCircle size={17} aria-hidden />
              {busyAction === "fail" ? "Submitting" : "Fail"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ReviewStateSummary({
  interview,
  reviewerEmail,
}: {
  interview: Interview;
  reviewerEmail: string;
}) {
  if (interview.reviewDecision) {
    return (
      <div className="notice grid gap-1 p-4 text-sm">
        <p className="font-bold">
          Decision: {interview.reviewDecision === "pass" ? "Pass" : "Fail"}
        </p>
        <p className="muted">
          Submitted by {interview.reviewedByEmail ?? "unknown reviewer"}
          {interview.reviewedAt ? ` at ${formatTimestamp(interview.reviewedAt)}` : ""}
        </p>
      </div>
    );
  }

  if (interview.reservedByEmail) {
    const reservedByCurrentReviewer =
      interview.reservedByEmail.toLowerCase() === reviewerEmail.toLowerCase();
    return (
      <div className="notice grid gap-1 p-4 text-sm">
        <p className="font-bold">
          {reservedByCurrentReviewer
            ? "Reserved by you"
            : `Reserved by ${interview.reservedByEmail}`}
        </p>
        <p className="muted">
          Reservations expire after 30 minutes if no decision is submitted.
        </p>
      </div>
    );
  }

  if (interview.status !== "completed") {
    return (
      <p className="muted text-sm">
        Review actions unlock after the candidate completes the interview.
      </p>
    );
  }

  return (
    <p className="muted text-sm">
      This interview is available. Reserve it to prevent duplicate reviews.
    </p>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function readReviewResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return {
      error: response.ok
        ? "Review status updated, but the server returned no details."
        : "The server returned an empty response. Refresh and try again.",
    };
  }

  try {
    return JSON.parse(text) as {
      interview?: Interview;
      error?: string;
    };
  } catch {
    return {
      error: response.ok
        ? "Review status updated, but the server returned an unreadable response."
        : "The server returned an unreadable response. Refresh and try again.",
    };
  }
}
