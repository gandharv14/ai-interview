# Resume SWE Interviewer Question Bank

Use this reference to choose anchor and probing questions while conducting a resume-based L3+ SWE interview. Ask one question at a time in live interview flow.

## Core Pattern

Every anchor question should be followed by at least one probe. Strong answers deserve two or three probes before changing topics.

Anchor questions open a competency area. Probing questions test evidence, ownership, detail, and authenticity.

## Technical Design

Anchor: How did you choose the service boundaries and API contracts?

Probes:

- Which data entities determined a service boundary?
- Was there a service boundary you rejected, then changed your mind about after seeing load tests or incidents?
- What was the versioning plan for one service you owned?
- What was the hardest API contract to keep stable, and why?
- What broke first when traffic or product requirements changed?

Anchor: What alternatives did you consider before landing on this design?

Probes:

- Which alternative was technically attractive but rejected?
- What specific constraint made the chosen design better?
- Who disagreed with the design, and what evidence resolved it?
- What would you change if you rebuilt it now?

## Implementation Depth

Anchor: What was the most technically complex part you personally implemented?

Probes:

- Which files, modules, services, or components did you own?
- What bug or edge case took the longest to solve?
- What assumptions did you encode in the implementation?
- How did you make the code testable or reviewable?
- What feedback did you receive in code review?

Anchor: How did you de-risk the implementation before launch?

Probes:

- What tests would have failed before your fix?
- Did you use feature flags, canaries, shadow traffic, backfills, or staged rollout?
- What was the rollback plan?
- What was the riskiest dependency?

## Metrics And Instrumentation

Anchor: How did you quantify success or regression? Was instrumentation involved to capture metrics?

Probes:

- What were the exact baselines and targets?
- Which guardrail metrics did you watch?
- What dashboards or alerts did you set up for yourself?
- Did you define rules for when to get paged?
- Which metric moved in a surprising direction?
- How did you distinguish real impact from noise or seasonality?

Anchor: What did you measure after launch?

Probes:

- What was the first dashboard you checked?
- What was the acceptance threshold for keeping the rollout live?
- Which metric was most likely to hide a regression?
- What did customers, users, or downstream teams notice?

## Debugging And Operations

Anchor: Tell me about an incident, regression, or hard production bug from this project.

Probes:

- How did you first detect it?
- What evidence narrowed the search space?
- What was your first hypothesis, and was it wrong?
- What did you change immediately versus after the incident?
- What follow-up work prevented recurrence?

Anchor: How did this system fail under load or unusual inputs?

Probes:

- What was the bottleneck?
- Which queue, database, cache, or external service constrained the system?
- How did you reproduce the failure?
- What changed in monitoring after the failure?

## Collaboration And Alignment

Anchor: Who did you need to align with? Was there any pushback or feedback you had to navigate to get approval?

Probes:

- What acceptance criteria were defined?
- What were the specific objections stakeholders raised?
- How did you manage competing concerns and assess tradeoffs?
- Which concern did you agree with after pushback?
- What changed in the plan because of another team's feedback?

Anchor: How did you coordinate work across people or teams?

Probes:

- What did you own versus delegate or depend on?
- What was the riskiest handoff?
- How did you keep dependencies unblocked?
- What decision needed explicit buy-in?

## Ownership And Authentic Involvement

Anchor: What part of this project would not have happened without you?

Probes:

- What decision did you personally make?
- What implementation detail can you explain better than anyone else on the team?
- Where did you push back on the initial plan?
- What did you learn only because you were close to the work?
- Who reviewed or approved your work?

Anchor: Where did your responsibility start and end?

Probes:

- Were you accountable for design, implementation, launch, operations, or all of them?
- What did someone else own?
- What did you need help with?
- What would your manager or tech lead say you contributed?

## Product Judgment And Tradeoffs

Anchor: How did you decide what was good enough for launch?

Probes:

- What was explicitly out of scope?
- What technical debt did you accept?
- What user or business constraint shaped the engineering decision?
- What would have caused you to delay launch?

Anchor: What tradeoff was hardest to explain to non-engineering stakeholders?

Probes:

- What were the options in plain language?
- What evidence made the cost worth it?
- How did you communicate risk?
- What did you monitor to prove the tradeoff worked?

## L3+ Competency Coverage

Use these competencies as a coverage checklist, not a rigid script:

- Technical depth: explains concrete implementation and system behavior.
- Execution: breaks down work, ships, tests, and handles rollout.
- Debugging: uses evidence to isolate failures and prevent recurrence.
- Design judgment: evaluates alternatives, boundaries, APIs, data models, and tradeoffs.
- Quality: thinks about correctness, observability, performance, reliability, and maintainability.
- Collaboration: aligns with stakeholders, handles pushback, and works across dependencies.
- Ownership: speaks clearly about personal contribution and accountability.
- Ambiguity: clarifies goals, makes assumptions explicit, and adapts based on evidence.
- Impact: connects engineering work to measurable user, business, or operational outcomes.

## Steer Techniques

Abstract or hypothetical answers:

- "Can you give me one specific time when that happened?"
- "Let's pick one concrete example from this project."

Obscured ownership:

- "When you say 'we', what did you personally own?"
- "Which part did you design or implement yourself?"
- "What decision were you accountable for?"

Project hopping:

- "I want to stay with this one project for another minute."
- "Let's not switch stories yet. What happened next in this project?"

Answering a different question:

- "That context is useful. The question I am trying to answer is..."
- "Let me ask it a different way..."

Low richness:

- "No problem, let's step up a level."
- "Let's move to another project where the details may be fresher."

## Closing

When time is nearly over, ask one broad closing question:

- "Is there a project on your resume that better shows your technical depth than the one we discussed?"
- "What is one engineering decision from your resume that you are proud of and can defend in detail?"
- "What should I make sure I understand about your scope or impact that we have not covered yet?"
