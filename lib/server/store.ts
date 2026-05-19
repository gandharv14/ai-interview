import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  hasSupabaseConfig,
  isProductionRuntime,
} from "@/lib/server/env";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import type {
  Interview,
  InterviewEvent,
  InterviewEventSource,
  InterviewInvite,
  InterviewStatus,
  InterviewSummary,
  InviteStatus,
  ParsedResume,
} from "@/lib/types";

const RESUME_BUCKET = "resumes";
const RECORDING_BUCKET = "interview-recordings";

type InviteInsert = {
  tokenHash: string;
  roleTitle: string;
  level: string;
  jobDescription: string;
  expiresAt: string;
};

type InterviewInsert = {
  inviteId?: string;
  candidateName: string;
  candidateEmail?: string;
  roleTitle: string;
  level: string;
  jobDescription: string;
  parsedResume: ParsedResume;
  resumeFilename?: string;
};

type EventInsert = {
  source: InterviewEventSource;
  type: string;
  text?: string;
  payload?: unknown;
  createdAt?: string;
};

type SummaryInsert = {
  model: string;
  evidence: string[];
  strengths: string[];
  risks: string[];
  followUpQuestions: string[];
  transcriptPath?: string;
};

type SupabaseInviteRow = {
  id: string;
  token_hash: string;
  role_title: string;
  level: string;
  job_description: string;
  expires_at: string;
  status: InviteStatus;
  created_at: string;
};

type SupabaseInterviewRow = {
  id: string;
  invite_id: string | null;
  candidate_name: string;
  candidate_email: string | null;
  role_title: string;
  level: string;
  job_description: string;
  status: InterviewStatus;
  resume_path: string | null;
  resume_filename: string | null;
  recording_path: string | null;
  parsed_resume: ParsedResume;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type SupabaseEventRow = {
  id: string;
  interview_id: string;
  source: InterviewEventSource;
  type: string;
  text: string | null;
  payload: unknown;
  created_at: string;
};

type SupabaseSummaryRow = {
  id: string;
  interview_id: string;
  model: string;
  evidence: string[];
  strengths: string[];
  risks: string[];
  follow_up_questions: string[];
  transcript_path: string | null;
  created_at: string;
};

type LocalStoreData = {
  invites: InterviewInvite[];
  interviews: Interview[];
  events: InterviewEvent[];
  summaries: InterviewSummary[];
};

function now() {
  return new Date().toISOString();
}

function localStorePath() {
  const configuredPath =
    process.env.INTERVIEW_AGENT_STORE_FILE ?? ".local-data/store.json";
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    configuredPath,
  );
}

function localUploadRoot() {
  return path.join(path.dirname(localStorePath()), "uploads");
}

async function ensureLocalData(): Promise<LocalStoreData> {
  const filePath = localStorePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as LocalStoreData;
  } catch {
    const data: LocalStoreData = {
      invites: [],
      interviews: [],
      events: [],
      summaries: [],
    };
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return data;
  }
}

async function writeLocalData(data: LocalStoreData) {
  const filePath = localStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

function mapInvite(row: SupabaseInviteRow): InterviewInvite {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    roleTitle: row.role_title,
    level: row.level,
    jobDescription: row.job_description,
    expiresAt: row.expires_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapInterview(row: SupabaseInterviewRow): Interview {
  return {
    id: row.id,
    inviteId: row.invite_id ?? undefined,
    candidateName: row.candidate_name,
    candidateEmail: row.candidate_email ?? undefined,
    roleTitle: row.role_title,
    level: row.level,
    jobDescription: row.job_description,
    status: row.status,
    resumePath: row.resume_path ?? undefined,
    resumeFilename: row.resume_filename ?? undefined,
    recordingPath: row.recording_path ?? undefined,
    parsedResume: row.parsed_resume,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row: SupabaseEventRow): InterviewEvent {
  return {
    id: row.id,
    interviewId: row.interview_id,
    source: row.source,
    type: row.type,
    text: row.text ?? undefined,
    payload: row.payload ?? undefined,
    createdAt: row.created_at,
  };
}

function mapSummary(row: SupabaseSummaryRow): InterviewSummary {
  return {
    id: row.id,
    interviewId: row.interview_id,
    model: row.model,
    evidence: row.evidence,
    strengths: row.strengths,
    risks: row.risks,
    followUpQuestions: row.follow_up_questions,
    transcriptPath: row.transcript_path ?? undefined,
    createdAt: row.created_at,
  };
}

function isExpired(invite: InterviewInvite) {
  return new Date(invite.expiresAt).getTime() < Date.now();
}

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  return supabase;
}

function shouldUseSupabaseStore() {
  if (hasSupabaseConfig()) return true;
  if (isProductionRuntime()) {
    throw new Error("Supabase env vars are required in production");
  }
  return false;
}

export async function createInvite(input: InviteInsert) {
  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("interview_invites")
      .insert({
        token_hash: input.tokenHash,
        role_title: input.roleTitle,
        level: input.level,
        job_description: input.jobDescription,
        expires_at: input.expiresAt,
        status: "active",
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapInvite(data as SupabaseInviteRow);
  }

  const data = await ensureLocalData();
  const invite: InterviewInvite = {
    id: crypto.randomUUID(),
    tokenHash: input.tokenHash,
    roleTitle: input.roleTitle,
    level: input.level,
    jobDescription: input.jobDescription,
    expiresAt: input.expiresAt,
    status: "active",
    createdAt: now(),
  };
  data.invites.unshift(invite);
  await writeLocalData(data);
  return invite;
}

export async function getInviteByTokenHash(tokenHash: string) {
  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("interview_invites")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const invite = mapInvite(data as SupabaseInviteRow);
    if (invite.status === "active" && isExpired(invite)) {
      await updateInviteStatus(invite.id, "expired");
      return { ...invite, status: "expired" as const };
    }
    return invite;
  }

  const data = await ensureLocalData();
  const invite = data.invites.find((item) => item.tokenHash === tokenHash);
  if (!invite) return undefined;
  if (invite.status === "active" && isExpired(invite)) {
    invite.status = "expired";
    await writeLocalData(data);
  }
  return invite;
}

export async function updateInviteStatus(id: string, status: InviteStatus) {
  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { error } = await supabase
      .from("interview_invites")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  const data = await ensureLocalData();
  const invite = data.invites.find((item) => item.id === id);
  if (invite) {
    invite.status = status;
    await writeLocalData(data);
  }
}

export async function createInterview(input: InterviewInsert) {
  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("interviews")
      .insert({
        invite_id: input.inviteId,
        candidate_name: input.candidateName,
        candidate_email: input.candidateEmail,
        role_title: input.roleTitle,
        level: input.level,
        job_description: input.jobDescription,
        status: "ready",
        parsed_resume: input.parsedResume,
        resume_filename: input.resumeFilename,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapInterview(data as SupabaseInterviewRow);
  }

  const data = await ensureLocalData();
  const createdAt = now();
  const interview: Interview = {
    id: crypto.randomUUID(),
    inviteId: input.inviteId,
    candidateName: input.candidateName,
    candidateEmail: input.candidateEmail,
    roleTitle: input.roleTitle,
    level: input.level,
    jobDescription: input.jobDescription,
    status: "ready",
    parsedResume: input.parsedResume,
    resumeFilename: input.resumeFilename,
    createdAt,
    updatedAt: createdAt,
  };
  data.interviews.unshift(interview);
  await writeLocalData(data);
  return interview;
}

export async function updateInterview(
  id: string,
  patch: Partial<
    Pick<
      Interview,
      | "status"
      | "resumePath"
      | "resumeFilename"
      | "recordingPath"
      | "parsedResume"
      | "startedAt"
      | "completedAt"
    >
  >,
) {
  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const updatePayload: Record<string, unknown> = {
      updated_at: now(),
    };
    if (patch.status) updatePayload.status = patch.status;
    if (patch.resumePath !== undefined) updatePayload.resume_path = patch.resumePath;
    if (patch.resumeFilename !== undefined) {
      updatePayload.resume_filename = patch.resumeFilename;
    }
    if (patch.recordingPath !== undefined) {
      updatePayload.recording_path = patch.recordingPath;
    }
    if (patch.parsedResume !== undefined) {
      updatePayload.parsed_resume = patch.parsedResume;
    }
    if (patch.startedAt !== undefined) updatePayload.started_at = patch.startedAt;
    if (patch.completedAt !== undefined) updatePayload.completed_at = patch.completedAt;

    const { data, error } = await supabase
      .from("interviews")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapInterview(data as SupabaseInterviewRow);
  }

  const data = await ensureLocalData();
  const interview = data.interviews.find((item) => item.id === id);
  if (!interview) throw new Error("Interview not found");
  Object.assign(interview, patch, { updatedAt: now() });
  await writeLocalData(data);
  return interview;
}

export async function getInterview(id: string) {
  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("interviews")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapInterview(data as SupabaseInterviewRow) : undefined;
  }

  const data = await ensureLocalData();
  return data.interviews.find((interview) => interview.id === id);
}

export async function listInterviews() {
  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("interviews")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as SupabaseInterviewRow[]).map(mapInterview);
  }

  const data = await ensureLocalData();
  return [...data.interviews].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function appendInterviewEvents(
  interviewId: string,
  events: EventInsert[],
) {
  if (events.length === 0) return [];

  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("interview_events")
      .insert(
        events.map((event) => {
          const row: Record<string, unknown> = {
            interview_id: interviewId,
            source: event.source,
            type: event.type,
            text: event.text,
            payload: event.payload,
          };
          if (event.createdAt) {
            row.created_at = event.createdAt;
          }
          return row;
        }),
      )
      .select("*");
    if (error) throw error;
    return (data as SupabaseEventRow[]).map(mapEvent);
  }

  const data = await ensureLocalData();
  const saved = events.map((event) => ({
    id: crypto.randomUUID(),
    interviewId,
    source: event.source,
    type: event.type,
    text: event.text,
    payload: event.payload,
    createdAt: event.createdAt ?? now(),
  }));
  data.events.push(...saved);
  await writeLocalData(data);
  return saved;
}

export async function listInterviewEvents(interviewId: string) {
  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("interview_events")
      .select("*")
      .eq("interview_id", interviewId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as SupabaseEventRow[]).map(mapEvent);
  }

  const data = await ensureLocalData();
  return data.events
    .filter((event) => event.interviewId === interviewId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function saveInterviewSummary(
  interviewId: string,
  input: SummaryInsert,
) {
  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("interview_summaries")
      .upsert(
        {
          interview_id: interviewId,
          model: input.model,
          evidence: input.evidence,
          strengths: input.strengths,
          risks: input.risks,
          follow_up_questions: input.followUpQuestions,
          transcript_path: input.transcriptPath,
        },
        { onConflict: "interview_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return mapSummary(data as SupabaseSummaryRow);
  }

  const data = await ensureLocalData();
  const existing = data.summaries.find(
    (summary) => summary.interviewId === interviewId,
  );
  const saved: InterviewSummary = {
    id: existing?.id ?? crypto.randomUUID(),
    interviewId,
    model: input.model,
    evidence: input.evidence,
    strengths: input.strengths,
    risks: input.risks,
    followUpQuestions: input.followUpQuestions,
    transcriptPath: input.transcriptPath,
    createdAt: existing?.createdAt ?? now(),
  };
  if (existing) {
    Object.assign(existing, saved);
  } else {
    data.summaries.push(saved);
  }
  await writeLocalData(data);
  return saved;
}

export async function getInterviewSummary(interviewId: string) {
  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("interview_summaries")
      .select("*")
      .eq("interview_id", interviewId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapSummary(data as SupabaseSummaryRow) : undefined;
  }

  const data = await ensureLocalData();
  return data.summaries.find((summary) => summary.interviewId === interviewId);
}

export async function uploadResume(interviewId: string, file: File) {
  return uploadPrivateFile(
    RESUME_BUCKET,
    `${interviewId}/${safeFileName(file.name)}`,
    file,
  );
}

export async function uploadRecording(
  interviewId: string,
  file: File,
  extension = "webm",
) {
  return uploadPrivateFile(
    RECORDING_BUCKET,
    `${interviewId}/recording.${extension}`,
    file,
  );
}

export async function uploadTranscript(interviewId: string, content: string) {
  const file = new File([content], "transcript.json", {
    type: "application/json",
  });
  return uploadPrivateFile(
    RECORDING_BUCKET,
    `${interviewId}/transcript.json`,
    file,
  );
}

async function uploadPrivateFile(bucket: string, objectPath: string, file: File) {
  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { error } = await supabase.storage.from(bucket).upload(objectPath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
    if (error) throw translateStorageError(error, bucket, objectPath);
    return objectPath;
  }

  const diskPath = path.join(localUploadRoot(), bucket, objectPath);
  await fs.mkdir(path.dirname(diskPath), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(diskPath, buffer);
  return objectPath;
}

export async function getPrivateFileUrl(bucket: string, objectPath?: string) {
  if (!objectPath) return undefined;

  if (shouldUseSupabaseStore()) {
    const supabase = requireSupabase();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(objectPath, 60 * 20);
    if (error) throw error;
    return data.signedUrl;
  }

  const params = new URLSearchParams({ bucket, path: objectPath });
  return `/api/dev/file?${params.toString()}`;
}

export async function readLocalPrivateFile(bucket: string, objectPath: string) {
  const diskPath = path.join(localUploadRoot(), bucket, objectPath);
  return fs.readFile(diskPath);
}

export function resumeBucketName() {
  return RESUME_BUCKET;
}

export function recordingBucketName() {
  return RECORDING_BUCKET;
}

function safeFileName(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned || "resume";
}

function translateStorageError(
  error: unknown,
  bucket: string,
  objectPath: string,
) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? String((error as { statusCode: unknown }).statusCode)
      : undefined;
  const isRlsFailure =
    /row[- ]level security/i.test(message) ||
    /not authorized/i.test(message) ||
    /unauthorized/i.test(message) ||
    statusCode === "403";
  if (!isRlsFailure) {
    return error instanceof Error ? error : new Error(message);
  }
  return new Error(
    `Supabase storage rejected upload to "${bucket}/${objectPath}" due to row-level security. ` +
      `Confirm SUPABASE_SERVICE_ROLE_KEY is the service_role JWT (not the anon key) and that the "${bucket}" bucket exists. ` +
      `Original error: ${message}`,
  );
}
