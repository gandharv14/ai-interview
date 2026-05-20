import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, Mic, UserRound } from "lucide-react";
import { AdminForbidden } from "@/components/admin-forbidden";
import { StatusBadge } from "@/components/status-badge";
import { getAdminAccessStatus } from "@/lib/server/admin";
import {
  getInterview,
  getInterviewSummary,
  getPrivateFileUrl,
  listInterviewEvents,
  recordingBucketName,
  resumeBucketName,
} from "@/lib/server/store";
import type { InterviewEvent } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
};

const EVENT_LABELS: Record<string, string> = {
  "conversation.item.input_audio_transcription.completed": "Candidate",
  "response.audio_transcript.done": "Interviewer",
  "response.output_text.done": "Interviewer",
  resume_parsed: "Resume parsed",
  realtime_started: "Session started",
  realtime_resumed: "Session resumed",
  recording_uploaded: "Recording uploaded",
  diarized_transcript: "Diarized transcript",
  diarized_transcript_failed: "Diarized transcript failed",
  interview_completed: "Interview completed",
  mock_realtime_started: "Mock session started",
};

function describeEvent(event: InterviewEvent) {
  const label = EVENT_LABELS[event.type];
  if (label) return label;
  return `${event.source} · ${event.type}`;
}

export default async function InterviewDetailPage({ params }: Props) {
  const { id } = await params;
  const access = await getAdminAccessStatus();
  if (access.status === "unauthenticated") {
    const returnTo = encodeURIComponent(`/admin/interviews/${id}`);
    redirect(`/auth/login?returnTo=${returnTo}`);
  }
  if (access.status === "forbidden") {
    return <AdminForbidden status={access} />;
  }

  const interview = await getInterview(id);
  if (!interview) notFound();
  const [events, summary, resumeUrl, recordingUrl] = await Promise.all([
    listInterviewEvents(id),
    getInterviewSummary(id),
    getPrivateFileUrl(resumeBucketName(), interview.resumePath),
    getPrivateFileUrl(recordingBucketName(), interview.recordingPath),
  ]);
  const transcriptEvents = events.filter((event) => event.text);

  return (
    <main className="shell py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin"
            className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-blue-700 no-underline"
          >
            <ArrowLeft size={16} aria-hidden />
            Back
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{interview.candidateName}</h1>
            <StatusBadge status={interview.status} />
          </div>
          <p className="muted mt-1">
            {interview.roleTitle} · {interview.level}
          </p>
        </div>
      </header>

      <div className="grid-two">
        <section className="grid gap-4">
          <article className="panel p-5">
            <div className="mb-3 flex items-center gap-2">
              <Mic size={19} aria-hidden />
              <h2 className="text-xl font-bold">Recording</h2>
            </div>
            {recordingUrl ? (
              <audio controls src={recordingUrl} className="w-full" />
            ) : (
              <p className="muted text-sm">No recording uploaded.</p>
            )}
          </article>

          <article className="panel p-5">
            <div className="mb-3 flex items-center gap-2">
              <FileText size={19} aria-hidden />
              <h2 className="text-xl font-bold">Transcript</h2>
            </div>
            <div className="grid max-h-[520px] gap-3 overflow-auto">
              {transcriptEvents.length === 0 ? (
                <p className="muted text-sm">No transcript events saved.</p>
              ) : (
                transcriptEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <p className="text-sm font-bold">{describeEvent(event)}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {event.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <aside className="grid gap-4">
          <article className="panel p-5">
            <div className="mb-3 flex items-center gap-2">
              <UserRound size={19} aria-hidden />
              <h2 className="text-xl font-bold">Resume Profile</h2>
            </div>
            <p className="font-bold">
              {interview.parsedResume.candidateName || interview.candidateName}
            </p>
            <p className="muted mt-1 text-sm">{interview.parsedResume.headline}</p>
            {resumeUrl ? (
              <a
                className="button button-secondary mt-4"
                href={resumeUrl}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={16} aria-hidden />
                Open resume
              </a>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {interview.parsedResume.skills.slice(0, 16).map((skill, index) => (
                <span className="badge" key={`${skill}-${index}`}>
                  {skill}
                </span>
              ))}
            </div>
          </article>

          <article className="panel p-5">
            <h2 className="text-xl font-bold">Reviewer Summary</h2>
            {!summary ? (
              <p className="muted mt-3 text-sm">No summary generated.</p>
            ) : (
              <div className="mt-3 grid gap-4 text-sm">
                <SummaryList title="Evidence" items={summary.evidence} />
                <SummaryList title="Strengths" items={summary.strengths} />
                <SummaryList title="Risks" items={summary.risks} />
                <SummaryList
                  title="Follow-up Questions"
                  items={summary.followUpQuestions}
                />
              </div>
            )}
          </article>
        </aside>
      </div>
    </main>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 font-bold">{title}</p>
      {items.length === 0 ? (
        <p className="muted">None captured.</p>
      ) : (
        <ul className="grid gap-2 pl-5">
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
