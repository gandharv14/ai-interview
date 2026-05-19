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
  parseResumeProfile,
} from "@/lib/server/resume";

const MAX_RESUME_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const fields = interviewStartFormSchema.parse({
    token: formData.get("token"),
    candidateName: formData.get("candidateName") || undefined,
    candidateEmail: formData.get("candidateEmail") || undefined,
    consent: formData.get("consent"),
  });

  const resume = formData.get("resume");
  if (!(resume instanceof File)) {
    return NextResponse.json({ error: "Resume file is required" }, { status: 400 });
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
  const resumePath = await uploadResume(interview.id, resume);
  const updated = await updateInterview(interview.id, {
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

  return NextResponse.json({
    interview: updated,
    parsedResume,
  });
}
