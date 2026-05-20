export type InviteStatus = "active" | "used" | "expired" | "revoked";

export type InterviewStatus = "ready" | "in_progress" | "completed" | "failed";

export type InterviewEventSource = "candidate" | "agent" | "system";

export type ResumeExperience = {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  highlights: string[];
};

export type ResumeProject = {
  name: string;
  description: string;
  technologies: string[];
  impact?: string;
};

export type ParsedResume = {
  candidateName?: string;
  email?: string;
  phone?: string;
  headline: string;
  skills: string[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: string[];
  highSignalClaims: string[];
};

export type InterviewInvite = {
  id: string;
  tokenHash: string;
  roleTitle: string;
  level: string;
  jobDescription: string;
  expiresAt: string;
  status: InviteStatus;
  createdAt: string;
};

export type Interview = {
  id: string;
  inviteId?: string;
  candidateName: string;
  candidateEmail?: string;
  roleTitle: string;
  level: string;
  jobDescription: string;
  status: InterviewStatus;
  resumePath?: string;
  resumeFilename?: string;
  recordingPath?: string;
  parsedResume: ParsedResume;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type InterviewEvent = {
  id: string;
  interviewId: string;
  source: InterviewEventSource;
  type: string;
  text?: string;
  payload?: unknown;
  createdAt: string;
};

export type InterviewSummary = {
  id: string;
  interviewId: string;
  model: string;
  evidence: string[];
  strengths: string[];
  risks: string[];
  followUpQuestions: string[];
  transcriptPath?: string;
  createdAt: string;
};

export type SetupIssue = {
  title: string;
  message: string;
  detail?: string;
};
