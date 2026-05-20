"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Clipboard,
  ExternalLink,
  FileText,
  LogOut,
  Plus,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { Interview, SetupIssue } from "@/lib/types";

type Props = {
  initialInterviews: Interview[];
  setupIssue?: SetupIssue;
};

type InviteResponse = {
  inviteUrl: string;
};

export function AdminDashboard({ initialInterviews, setupIssue }: Props) {
  const [interviews, setInterviews] = useState(initialInterviews);
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const databaseUnavailable = Boolean(setupIssue);

  async function createInvite(formData: FormData) {
    if (setupIssue) {
      setError(setupIssue.message);
      return;
    }

    setBusy(true);
    setError("");
    setInviteUrl("");
    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleTitle: formData.get("roleTitle"),
          level: formData.get("level"),
          jobDescription: formData.get("jobDescription"),
          expiresInDays: formData.get("expiresInDays"),
        }),
      });
      const data = (await response.json()) as InviteResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not create invite");
      setInviteUrl(data.inviteUrl);
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
      setError(data.error || "Could not refresh interviews");
      return;
    }
    if (data.interviews) setInterviews(data.interviews);
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
  }

  return (
    <main className="shell py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="muted text-sm font-bold uppercase tracking-wide">
            Interview Agent
          </p>
          <h1 className="mt-1 text-3xl font-bold">Software Interview Console</h1>
        </div>
        <a className="button button-secondary" href="/auth/logout">
          <LogOut size={17} aria-hidden />
          Sign out
        </a>
      </header>

      {setupIssue ? (
        <section
          className="panel mb-6 grid gap-2 border-amber-200 bg-amber-50 p-5"
          role="alert"
        >
          <h2 className="text-lg font-bold text-amber-950">
            {setupIssue.title}
          </h2>
          <p className="text-sm text-amber-950">{setupIssue.message}</p>
          <p className="text-sm text-amber-950">
            Auth0 login and the admin allowlist succeeded. Database-backed
            actions are disabled until Supabase uses the real service_role key.
          </p>
          {setupIssue.detail ? (
            <p className="rounded-lg border border-amber-200 bg-white/70 p-3 font-mono text-xs text-amber-950">
              {setupIssue.detail}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="grid-two">
        <form
          className="panel grid gap-4 p-5"
          action={(formData) => {
            void createInvite(formData);
          }}
        >
          <div className="flex items-center gap-2">
            <Plus size={19} aria-hidden />
            <h2 className="text-xl font-bold">Create Invite</h2>
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
          <div className="grid grid-cols-2 gap-3">
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
          {error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}
          {inviteUrl ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-bold text-blue-950">Invite link</p>
              <div className="mt-2 flex gap-2">
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
            </div>
          ) : null}
        </form>

        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText size={19} aria-hidden />
              <h2 className="text-xl font-bold">Interviews</h2>
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
          <div className="grid gap-3">
            {interviews.length === 0 ? (
              <p className="muted rounded-lg border border-dashed border-slate-300 p-5 text-sm">
                No interviews yet.
              </p>
            ) : (
              interviews.map((interview) => (
                <Link
                  key={interview.id}
                  href={`/admin/interviews/${interview.id}`}
                  className="grid gap-2 rounded-lg border border-slate-200 bg-white p-4 text-inherit no-underline transition hover:border-blue-300"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <UserRound size={17} aria-hidden />
                        <p className="truncate font-bold">
                          {interview.candidateName}
                        </p>
                      </div>
                      <p className="muted mt-1 text-sm">
                        {interview.roleTitle} · {interview.level}
                      </p>
                    </div>
                    <StatusBadge status={interview.status} />
                  </div>
                  <div className="flex items-center gap-1 text-sm font-bold text-blue-700">
                    Review
                    <ExternalLink size={14} aria-hidden />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
