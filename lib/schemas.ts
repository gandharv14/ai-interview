import { z } from "zod";

export const resumeExperienceSchema = z.object({
  company: z.string().default(""),
  title: z.string().default(""),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  highlights: z.array(z.string()).default([]),
});

export const resumeProjectSchema = z.object({
  name: z.string().default(""),
  description: z.string().default(""),
  technologies: z.array(z.string()).default([]),
  impact: z.string().optional(),
});

export const parsedResumeSchema = z.object({
  candidateName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  headline: z.string().default(""),
  skills: z.array(z.string()).default([]),
  experience: z.array(resumeExperienceSchema).default([]),
  projects: z.array(resumeProjectSchema).default([]),
  education: z.array(z.string()).default([]),
  highSignalClaims: z.array(z.string()).default([]),
});

export const createInviteSchema = z.object({
  roleTitle: z.string().trim().min(2).max(120),
  level: z.string().trim().min(1).max(80),
  jobDescription: z.string().trim().max(8000).default(""),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(14),
});

export const interviewEventInputSchema = z.object({
  source: z.enum(["candidate", "agent", "system"]),
  type: z.string().trim().min(1).max(120),
  text: z.string().trim().max(20_000).optional(),
  payload: z.unknown().optional(),
  createdAt: z.string().datetime().optional(),
});

export const interviewEventBatchSchema = z.object({
  events: z.array(interviewEventInputSchema).min(1).max(100),
});

export const interviewStartFormSchema = z.object({
  token: z.string().trim().min(20),
  candidateName: z.string().trim().max(120).optional(),
  candidateEmail: z.string().trim().email().optional().or(z.literal("")),
  consent: z.literal("true"),
});

export const summarySchema = z.object({
  evidence: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  followUpQuestions: z.array(z.string()).default([]),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type InterviewEventInput = z.infer<typeof interviewEventInputSchema>;
export type SummaryInput = z.infer<typeof summarySchema>;

export const parsedResumeJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidateName: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    headline: { type: "string" },
    skills: { type: "array", items: { type: "string" } },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          highlights: { type: "array", items: { type: "string" } },
        },
        required: ["company", "title", "highlights"],
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          technologies: { type: "array", items: { type: "string" } },
          impact: { type: "string" },
        },
        required: ["name", "description", "technologies"],
      },
    },
    education: { type: "array", items: { type: "string" } },
    highSignalClaims: { type: "array", items: { type: "string" } },
  },
  required: [
    "headline",
    "skills",
    "experience",
    "projects",
    "education",
    "highSignalClaims",
  ],
} as const;

export const summaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    evidence: { type: "array", items: { type: "string" } },
    strengths: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    followUpQuestions: { type: "array", items: { type: "string" } },
  },
  required: ["evidence", "strengths", "risks", "followUpQuestions"],
} as const;
