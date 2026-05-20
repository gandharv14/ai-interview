import { z } from "zod";

const nullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (value == null ? undefined : value));

// LLM-friendly: accept any string or null. Validate the result and downgrade
// junk to undefined rather than throwing. This keeps a single bad-formatted
// email or phone from torpedoing the whole resume parse.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const looseEmail = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return EMAIL_REGEX.test(trimmed) ? trimmed : undefined;
  });

const loosePhone = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    // Need at least 7 digits to be a plausible phone number; otherwise drop it.
    const digits = trimmed.replace(/\D+/g, "");
    return digits.length >= 7 ? trimmed : undefined;
  });

export const resumeExperienceSchema = z.object({
  company: z.string().default(""),
  title: z.string().default(""),
  startDate: nullableString,
  endDate: nullableString,
  highlights: z.array(z.string()).default([]),
});

export const resumeProjectSchema = z.object({
  name: z.string().default(""),
  description: z.string().default(""),
  technologies: z.array(z.string()).default([]),
  impact: nullableString,
});

export const parsedResumeSchema = z.object({
  candidateName: nullableString,
  email: looseEmail,
  phone: loosePhone,
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
  linkCount: z.coerce.number().int().min(1).max(100).default(1),
});

// Workaround: avoid `z.iso.datetime()` because Turbopack + Zod v4 produces a
// TDZ error when bundling `z.iso.*` chunks with our route handlers. Plain
// regex validation has the same intent (RFC 3339-like ISO timestamp).
const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const interviewEventInputSchema = z.object({
  source: z.enum(["candidate", "agent", "system"]),
  type: z.string().trim().min(1).max(120),
  text: z.string().trim().max(20_000).optional(),
  payload: z.unknown().optional(),
  createdAt: z
    .string()
    .regex(ISO_DATETIME_REGEX, "Must be an ISO 8601 datetime")
    .optional(),
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
    candidateName: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
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
          startDate: { type: ["string", "null"] },
          endDate: { type: ["string", "null"] },
          highlights: { type: "array", items: { type: "string" } },
        },
        required: ["company", "title", "startDate", "endDate", "highlights"],
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
          impact: { type: ["string", "null"] },
        },
        required: ["name", "description", "technologies", "impact"],
      },
    },
    education: { type: "array", items: { type: "string" } },
    highSignalClaims: { type: "array", items: { type: "string" } },
  },
  required: [
    "candidateName",
    "email",
    "phone",
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
