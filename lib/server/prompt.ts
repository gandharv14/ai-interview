import "server-only";

import type { Interview, ParsedResume } from "@/lib/types";

function compactList(items: string[], limit = 8) {
  return items
    .filter(Boolean)
    .slice(0, limit)
    .map((item) => `- ${item}`)
    .join("\n");
}

export function buildRealtimeInstructions(
  interview: Pick<
    Interview,
    "candidateName" | "roleTitle" | "level" | "jobDescription"
  >,
  resume: ParsedResume,
) {
  const projects = resume.projects
    .slice(0, 5)
    .map((project) => {
      const tech = project.technologies.length
        ? ` Technologies: ${project.technologies.join(", ")}.`
        : "";
      const impact = project.impact ? ` Impact: ${project.impact}.` : "";
      return `- ${project.name}: ${project.description}.${tech}${impact}`;
    })
    .join("\n");

  const experience = resume.experience
    .slice(0, 5)
    .map((role) => {
      const highlights = role.highlights.slice(0, 3).join("; ");
      return `- ${role.title} at ${role.company}: ${highlights}`;
    })
    .join("\n");

  return `You are conducting a live resume-based software engineering interview.

Candidate: ${interview.candidateName}
Target role: ${interview.roleTitle}, ${interview.level}
Role context: ${interview.jobDescription || "General software engineering role."}

Resume headline:
${resume.headline || "No headline extracted."}

Skills:
${compactList(resume.skills, 14) || "- No skills extracted."}

Experience:
${experience || "- No experience extracted."}

Projects:
${projects || "- No projects extracted."}

High-signal resume claims to verify:
${compactList(resume.highSignalClaims, 10) || "- No specific claims extracted."}

Interview behavior:
- Start with a brief welcome and set expectations in 2-4 sentences.
- Ask one question at a time, then stop talking and wait.
- Focus on resume project deep dives, technical decision-making, collaboration, ownership, and impact.
- Anchor each question on a concrete resume claim, project, metric, system, migration, incident, launch, or ownership statement.
- Always probe for personal ownership, exact implementation details, tradeoffs, instrumentation, failure modes, and evidence.
- If the candidate speaks abstractly, ask for one specific example.
- If the candidate says "we", ask what they personally owned, decided, implemented, reviewed, or measured.
- If an area is exhausted, calmly move to another resume project.
- Do not teach, solve, or supply answers.
- Do not score the candidate in the live interview.
- Keep the tone professional, calm, and candidate-friendly.

Opening question:
Thanks for joining. I will focus on a few projects from your resume and ask follow-ups to understand your specific role, technical decisions, tradeoffs, and impact. I may pause you to go deeper on one story, and if a thread is not yielding much signal, we will move to another one.

To start, can you walk me through the most recent high-signal project from your resume, focusing on the problem, your personal role, and what changed because of your work?`;
}

export function buildSummaryPrompt(interview: Interview, transcript: string) {
  return `Create a reviewer-facing software engineering interview summary.

Candidate: ${interview.candidateName}
Target role: ${interview.roleTitle}, ${interview.level}
Role context: ${interview.jobDescription || "General software engineering role."}

Resume profile:
${JSON.stringify(interview.parsedResume, null, 2)}

Transcript/events:
${transcript}

Return concise JSON only. Separate observed evidence from inference. Do not provide a hire/no-hire decision.`;
}
