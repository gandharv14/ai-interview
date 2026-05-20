import { expect, test } from "@playwright/test";
import { generateSessionCookie } from "@auth0/nextjs-auth0/testing";
import { createPdfFixture } from "../test/fixtures/pdf";

const auth0Secret =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test.beforeEach(async ({ context }) => {
  const sessionCookie = await generateSessionCookie(
    {
      user: {
        sub: "auth0|e2e-admin",
        name: "E2E Admin",
        email: "admin@example.com",
        email_verified: true,
      },
      tokenSet: {
        accessToken: "test-access-token",
        expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
      },
    },
    { secret: auth0Secret },
  );

  await context.addCookies([
    {
      name: "__session",
      value: sessionCookie,
      url: "http://localhost:3100",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});

test("admin creates invite and candidate completes mocked interview workflow", async ({
  page,
}) => {
  const candidateName = `Grace Hopper ${Date.now()}`;

  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Software Interview Console" }),
  ).toBeVisible();

  await page.getByLabel("Role title").fill("Senior Backend Engineer");
  await page.getByLabel("Level").fill("L5");
  await page
    .getByLabel("Job description")
    .fill("Distributed systems, APIs, reliability, and operational ownership.");
  await page.getByRole("button", { name: "Create invite" }).click();

  const inviteInput = page.locator("input[readonly]");
  await expect(inviteInput).toHaveValue(/\/i\/inv_/);
  const inviteUrl = await inviteInput.inputValue();

  await page.goto(inviteUrl);
  await page.getByLabel("Name").fill(candidateName);
  await page.getByLabel("Email").fill("grace@example.com");
  await page.getByLabel("Resume").setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: createPdfFixture([
      "Grace Hopper",
      "grace@example.com",
      "Led API migration from a monolith to services.",
      "Built Node and TypeScript reliability tooling.",
      "Reduced latency and improved dashboards.",
    ]),
  });
  await page
    .getByLabel("I consent to recording and storing this interview for review.")
    .check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Resume parsed. Voice interview is ready.")).toBeVisible();
  await page.getByRole("button", { name: "Start voice interview" }).click();
  await expect(page.getByText("Complete").last()).toBeVisible();

  await page.goto("/admin");
  const candidateCard = page.locator("article").filter({ hasText: candidateName });
  await expect(candidateCard).toBeVisible();
  await candidateCard.getByRole("link", { name: /Review interview/ }).click();
  await expect(page.getByRole("heading", { name: candidateName })).toBeVisible();
  await expect(page.getByText(/Recording uploaded \(/).first()).toBeVisible();
  await expect(
    page
      .getByText(
        "I owned the API redesign, rollout plan, and monitoring for the migration.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
});

test("candidate-session-protected route returns 401 without the cookie", async ({
  request,
}) => {
  // Use a random UUID; the session check fires before the lookup, so a 401
  // is the right response regardless of whether the interview exists.
  const response = await request.post(
    "/api/interviews/00000000-0000-0000-0000-000000000000/realtime-token",
  );
  expect(response.status()).toBe(401);
});

test("candidate can upload a real resume PDF and reach the ready state", async ({
  page,
}) => {
  test.skip(
    !process.env.REAL_RESUME_PATH,
    "Set REAL_RESUME_PATH to run against a local resume PDF.",
  );
  const candidateName = `Real Resume Candidate ${Date.now()}`;

  await page.goto("/admin");
  await page.getByLabel("Role title").fill("Senior Backend Engineer");
  await page.getByLabel("Level").fill("L5");
  await page
    .getByLabel("Job description")
    .fill("Distributed systems, APIs, reliability, and operational ownership.");
  await page.getByRole("button", { name: "Create invite" }).click();

  const inviteInput = page.locator("input[readonly]");
  await expect(inviteInput).toHaveValue(/\/i\/inv_/);
  const inviteUrl = await inviteInput.inputValue();

  await page.goto(inviteUrl);
  await page.getByLabel("Name").fill(candidateName);
  await page.getByLabel("Email").fill("real-resume@example.com");
  await page.getByLabel("Resume").setInputFiles(process.env.REAL_RESUME_PATH!);
  await page
    .getByLabel("I consent to recording and storing this interview for review.")
    .check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Resume parsed. Voice interview is ready.")).toBeVisible();
});
