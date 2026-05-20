"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Clipboard,
  CheckCircle2,
  ExternalLink,
  FileText,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { Interview, SetupIssue } from "@/lib/types";

type Props = {
  initialInterviews: Interview[];
  reviewerEmail: string;
  setupIssue?: SetupIssue;
};

type InviteResponse = {
  inviteUrl?: string;
  inviteUrls?: string[];
};

export function AdminDashboard({
  initialInterviews,
  reviewerEmail,
  setupIssue,
}: Props) {
  const [interviews, setInterviews] = useState(initialInterviews);
  const [inviteUrls, setInviteUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reservingId, setReservingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [interviewError, setInterviewError] = useState("");
  const databaseUnavailable = Boolean(setupIssue);
  const inviteUrl = inviteUrls[0] ?? "";
  const inviteListText = inviteUrls.join("\n");
  const completedCount = interviews.filter(
    (interview) => interview.status === "completed",
  ).length;
  const liveCount = interviews.filter(
    (interview) => interview.status === "in_progress",
  ).length;
  const reviewedCount = interviews.filter(
    (interview) => interview.reviewDecision,
  ).length;

  async function createInvite(formData: FormData) {
    if (setupIssue) {
      setError(setupIssue.message);
      return;
    }

    setBusy(true);
    setError("");
    setInviteUrls([]);
    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleTitle: formData.get("roleTitle"),
          level: formData.get("level"),
          jobDescription: formData.get("jobDescription"),
          expiresInDays: formData.get("expiresInDays"),
          linkCount: formData.get("linkCount"),
        }),
      });
      const data = (await response.json()) as InviteResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not create invite");
      const urls = data.inviteUrls?.length
        ? data.inviteUrls
        : data.inviteUrl
          ? [data.inviteUrl]
          : [];
      setInviteUrls(urls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invite");
    } finally {
      setBusy(false);
    }
  }

  async function refreshInterviews() {
    if (setupIssue) return;

    const response = await fetch("/api/admin/interviews");
    const data = (await response.json()) as {
      interviews?: Interview[];
      error?: string;
    };
    if (!response.ok) {
      setInterviewError(data.error || "Could not refresh interviews");
      return;
    }
    if (data.interviews) {
      setInterviewError("");
      setInterviews(data.interviews);
    }
  }

  async function deleteInterview(id: string, candidateName: string) {
    if (setupIssue) {
      setInterviewError(setupIssue.message);
      return;
    }
    if (!window.confirm(`Delete interview for ${candidateName}?`)) return;

    setDeletingId(id);
    setInterviewError("");
    try {
      const response = await fetch(`/api/admin/interviews/${id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not delete interview");
      setInterviews((current) =>
        current.filter((interview) => interview.id !== id),
      );
    } catch (err) {
      setInterviewError(
        err instanceof Error ? err.message : "Could not delete interview",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function reserveInterview(id: string) {
    if (setupIssue) {
      setInterviewError(setupIssue.message);
      return;
    }

    setReservingId(id);
    setInterviewError("");
    try {
      const response = await fetch(`/api/admin/interviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reserve" }),
      });
      const data = (await response.json()) as {
        interview?: Interview;
        error?: string;
      };
      if (!response.ok) {
        if (data.interview) updateInterviewInList(data.interview);
        throw new Error(data.error || "Could not reserve interview");
      }
      if (data.interview) updateInterviewInList(data.interview);
    } catch (err) {
      setInterviewError(
        err instanceof Error ? err.message : "Could not reserve interview",
      );
    } finally {
      setReservingId(null);
    }
  }

  function updateInterviewInList(updated: Interview) {
    setInterviews((current) =>
      current.map((interview) =>
        interview.id === updated.id ? updated : interview,
      ),
    );
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
  }

  async function copyInviteList() {
    if (!inviteListText) return;
    await navigator.clipboard.writeText(inviteListText);
  }

  return (
    <main className="shell py-8 sm:py-10">
      <header className="panel panel-strong mb-6 grid gap-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="section-kicker">Interview Agent</p>
            <h1 className="page-title mt-3">Software Interview Console</h1>
            <p className="muted mt-4 max-w-2xl text-base">
              Create candidate-specific invites, monitor live sessions, and
              review completed recordings from a single workspace.
            </p>
          </div>
          <a className="button button-secondary" href="/auth/logout">
            <LogOut size={17} aria-hidden />
            Sign out
          </a>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="stat-card">
            <p className="muted text-xs font-bold uppercase tracking-wide">
              Total interviews
            </p>
            <p className="mt-2 text-3xl font-bold">{interviews.length}</p>
          </div>
          <div className="stat-card">
            <p className="muted text-xs font-bold uppercase tracking-wide">
              In progress
            </p>
            <p className="mt-2 text-3xl font-bold">{liveCount}</p>
          </div>
          <div className="stat-card">
            <p className="muted text-xs font-bold uppercase tracking-wide">
              Completed
            </p>
            <p className="mt-2 text-3xl font-bold">{completedCount}</p>
          </div>
          <div className="stat-card">
            <p className="muted text-xs font-bold uppercase tracking-wide">
              Reviewed
            </p>
            <p className="mt-2 text-3xl font-bold">{reviewedCount}</p>
          </div>
        </div>
      </header>

      {setupIssue ? (
        <section className="notice mb-6 grid gap-2 p-5" role="alert">
          <h2 className="section-title">{setupIssue.title}</h2>
          <p className="text-sm">{setupIssue.message}</p>
          <p className="text-sm">
            Auth0 login and the admin allowlist succeeded. Database-backed
            actions are disabled until Supabase uses the real service_role key.
          </p>
          {setupIssue.detail ? (
            <p className="rounded-xl border border-border-strong bg-panel p-3 font-mono text-xs text-foreground">
              {setupIssue.detail}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="grid-two">
        <form
          className="panel grid gap-5 p-5 sm:p-6"
          action={(formData) => {
            void createInvite(formData);
          }}
        >
          <div className="flex items-start gap-3">
            <span className="rounded-full border border-border bg-panel-subtle p-2">
              <Plus size={18} aria-hidden />
            </span>
            <div>
              <p className="section-kicker">Invite Builder</p>
              <h2 className="section-title mt-1">Create Invite</h2>
              <p className="muted mt-1 text-sm">
                Generate a one-time candidate link with the role context baked in.
              </p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="roleTitle">Role title</label>
            <input
              id="roleTitle"
              name="roleTitle"
              className="input"
              placeholder="Senior Software Engineer"
              disabled={databaseUnavailable}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="field">
              <label htmlFor="level">Level</label>
              <input
                id="level"
                name="level"
                className="input"
                placeholder="L4 / Senior"
                disabled={databaseUnavailable}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="expiresInDays">Expires in days</label>
              <input
                id="expiresInDays"
                name="expiresInDays"
                className="input"
                type="number"
                min="1"
                max="90"
                defaultValue="14"
                disabled={databaseUnavailable}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="linkCount">Number of links</label>
              <input
                id="linkCount"
                name="linkCount"
                className="input"
                type="number"
                min="1"
                max="100"
                defaultValue="1"
                disabled={databaseUnavailable}
                required
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="jobDescription">Job description</label>
            <textarea
              id="jobDescription"
              name="jobDescription"
              className="textarea"
              placeholder="Backend platform role focused on distributed systems, reliability, APIs..."
              disabled={databaseUnavailable}
            />
          </div>
          <button
            className="button button-primary"
            type="submit"
            disabled={busy || databaseUnavailable}
          >
            <Plus size={17} aria-hidden />
            {databaseUnavailable
              ? "Database setup required"
              : busy
                ? "Creating"
                : "Create invite"}
          </button>
          {error ? <p className="text-sm font-bold text-foreground">{error}</p> : null}
          {inviteUrls.length > 0 ? (
            <div className="notice grid gap-3 p-4">
              <div>
                <p className="text-sm font-bold text-foreground">
                  {inviteUrls.length === 1 ? "Invite link" : "Invite links"}
                </p>
                <p className="muted mt-1 text-sm">
                  {inviteUrls.length === 1
                    ? "Share this URL with the candidate. It can only be used once."
                    : "Copy this one-link-per-row list into a CSV or spreadsheet column."}
                </p>
              </div>
              {inviteUrls.length === 1 ? (
                <div className="flex gap-2">
                  <input className="input" readOnly value={inviteUrl} />
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={copyInvite}
                    aria-label="Copy invite link"
                  >
                    <Clipboard size={17} aria-hidden />
                  </button>
                </div>
              ) : (
                <div className="grid gap-2">
                  <textarea
                    className="textarea font-mono text-xs"
                    readOnly
                    rows={Math.min(inviteUrls.length, 8)}
                    value={inviteListText}
                  />
                  <button
                    className="button button-secondary w-fit"
                    type="button"
                    onClick={copyInviteList}
                    aria-label="Copy invite links"
                  >
                    <Clipboard size={17} aria-hidden />
                    Copy CSV / Excel column
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </form>

        <section className="panel p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="rounded-full border border-border bg-panel-subtle p-2">
                <FileText size={18} aria-hidden />
              </span>
              <div>
                <p className="section-kicker">Pipeline</p>
                <h2 className="section-title mt-1">Interviews</h2>
              </div>
            </div>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void refreshInterviews()}
              disabled={databaseUnavailable}
            >
              <RefreshCw size={16} aria-hidden />
              Refresh
            </button>
          </div>
          {interviewError ? (
            <p className="mb-3 text-sm font-bold text-foreground">
              {interviewError}
            </p>
          ) : null}
          <div className="grid gap-3">
            {interviews.length === 0 ? (
              <div className="empty-state p-6 text-sm">
                No interviews yet. Create an invite to start building the queue.
              </div>
            ) : (
              interviews.map((interview) => (
                <article key={interview.id} className="card-list-item grid gap-4 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <UserRound size={17} aria-hidden />
                        <p className="truncate text-lg font-bold">
                          {interview.candidateName}
                        </p>
                      </div>
                      <p className="muted mt-1 text-sm">
                        {interview.roleTitle} · {interview.level}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={interview.status} />
                      <ReviewBadge
                        interview={interview}
                        reviewerEmail={reviewerEmail}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <Link
                      href={`/admin/interviews/${interview.id}`}
                      className="link inline-flex items-center gap-1 text-sm"
                    >
                      Review interview
                      <ExternalLink size={14} aria-hidden />
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      {interview.status === "completed" &&
                      !interview.reviewDecision ? (
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => void reserveInterview(interview.id)}
                          disabled={
                            databaseUnavailable ||
                            reservingId === interview.id ||
                            Boolean(interview.reservedByEmail)
                          }
                        >
                          <LockKeyhole size={16} aria-hidden />
                          {reservingId === interview.id
                            ? "Reserving"
                            : interview.reservedByEmail
                              ? "Reserved"
                              : "Reserve"}
                        </button>
                      ) : null}
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() =>
                          void deleteInterview(interview.id, interview.candidateName)
                        }
                        disabled={
                          databaseUnavailable || deletingId === interview.id
                        }
                        aria-label={`Delete interview for ${interview.candidateName}`}
                      >
                        <Trash2 size={16} aria-hidden />
                        {deletingId === interview.id ? "Deleting" : "Delete"}
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function ReviewBadge({
  interview,
  reviewerEmail,
}: {
  interview: Interview;
  reviewerEmail: string;
}) {
  if (interview.reviewDecision) {
    return (
      <span className="badge">
        <CheckCircle2 size={14} aria-hidden />
        {interview.reviewDecision === "pass" ? "Passed" : "Failed"}
      </span>
    );
  }

  if (interview.reservedByEmail) {
    const reservedByCurrentReviewer =
      interview.reservedByEmail.toLowerCase() === reviewerEmail.toLowerCase();
    return (
      <span className="badge">
        <LockKeyhole size={14} aria-hidden />
        {reservedByCurrentReviewer
          ? "Reserved by you"
          : `Reserved by ${interview.reservedByEmail}`}
      </span>
    );
  }

  if (interview.status === "completed") {
    return <span className="badge">Available to reserve</span>;
  }

  return null;
}
