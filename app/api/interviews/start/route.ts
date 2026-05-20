import { NextRequest, NextResponse } from "next/server";
import { interviewStartFormSchema } from "@/lib/schemas";
import {
  hashInviteToken,
  verifyInviteTokenSignature,
} from "@/lib/server/security";
import {
  appendInterviewEvents,
  createInterview,
  getInviteByTokenHash,
  updateInviteStatus,
  updateInterview,
  uploadResume,
} from "@/lib/server/store";
import {
  extractResumeText,
  isPdfResumeFile,
  ResumeFileError,
  parseResumeProfile,
} from "@/lib/server/resume";
import {
  buildCandidateSessionCookie,
  signCandidateSession,
} from "@/lib/server/candidate-session";

export const runtime = "nodejs";

const MAX_RESUME_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    return await startInterview(request);
  } catch (error) {
    if (!(error instanceof ResumeFileError)) {
      console.error("/api/interviews/start failed", error);
    }
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: error instanceof ResumeFileError ? 400 : 500 },
    );
  }
}

async function startInterview(request: NextRequest) {
  const formData = await request.formData();
  const parsedFields = interviewStartFormSchema.safeParse({
    token: formData.get("token"),
    candidateName: formData.get("candidateName") || undefined,
    candidateEmail: formData.get("candidateEmail") || undefined,
    consent: formData.get("consent"),
  });
  if (!parsedFields.success) {
    return NextResponse.json(
      { error: "Check the resume upload form and try again." },
      { status: 400 },
    );
  }
  const fields = parsedFields.data;

  const resume = formData.get("resume");
  if (!(resume instanceof File)) {
    return NextResponse.json({ error: "Resume file is required" }, { status: 400 });
  }
  if (!isPdfResumeFile(resume)) {
    return NextResponse.json(
      { error: "Resume must be a PDF file." },
      { status: 400 },
    );
  }
  if (resume.size > MAX_RESUME_BYTES) {
    return NextResponse.json(
      { error: "Resume file must be 12MB or smaller" },
      { status: 400 },
    );
  }
  if (!verifyInviteTokenSignature(fields.token)) {
    return NextResponse.json({ error: "Invalid invite token" }, { status: 401 });
  }

  const invite = await getInviteByTokenHash(hashInviteToken(fields.token));
  if (!invite || invite.status !== "active") {
    return NextResponse.json(
      { error: "Invite is not available" },
      { status: 409 },
    );
  }

  const resumeText = await extractResumeText(resume);
  const parsedResume = await parseResumeProfile(resumeText, {
    roleTitle: invite.roleTitle,
    level: invite.level,
    jobDescription: invite.jobDescription,
  });

  const candidateName =
    fields.candidateName || parsedResume.candidateName || "Candidate";
  const candidateEmail = fields.candidateEmail || parsedResume.email;

  const interview = await createInterview({
    inviteId: invite.id,
    candidateName,
    candidateEmail: candidateEmail || undefined,
    roleTitle: invite.roleTitle,
    level: invite.level,
    jobDescription: invite.jobDescription,
    parsedResume,
    resumeFilename: resume.name,
  });

  let updated;
  try {
    const resumePath = await uploadResume(interview.id, resume);
    updated = await updateInterview(interview.id, {
      resumePath,
      resumeFilename: resume.name,
    });
    await updateInviteStatus(invite.id, "used");
    await appendInterviewEvents(updated.id, [
      {
        source: "system",
        type: "resume_parsed",
        text: `Resume parsed for ${candidateName}.`,
        payload: {
          resumeFilename: resume.name,
          extractedCharacters: resumeText.length,
        },
      },
    ]);
  } catch (error) {
    // Rollback: mark the half-built interview as failed so the admin can see
    // it and the candidate can re-use the still-active invite.
    try {
      await updateInterview(interview.id, { status: "failed" });
    } catch (markFailedError) {
      console.error(
        "Failed to mark interview as failed after start failure",
        markFailedError,
      );
    }
    throw error;
  }

  const sessionToken = signCandidateSession(updated.id);
  const cookie = buildCandidateSessionCookie(sessionToken, updated.id);

  return NextResponse.json(
    {
      interview: updated,
      parsedResume,
    },
    {
      headers: {
        "Set-Cookie": cookie,
      },
    },
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string" &&
    (error as { message: string }).message.length > 0
  ) {
    return (error as { message: string }).message;
  }
  return "Could not start interview";
}
