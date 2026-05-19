import { expect, test } from "@playwright/test";
import { generateSessionCookie } from "@auth0/nextjs-auth0/testing";

const auth0Secret =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test.beforeEach(async ({ context }) => {
  const sessionCookie = await generateSessionCookie(
    {
      user: {
        sub: "auth0|e2e-admin",
        name: "E2E Admin",
        email: "admin@example.com",
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
    name: "resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      [
        "Grace Hopper",
        "grace@example.com",
        "Led API migration from a monolith to services.",
        "Built Node and TypeScript reliability tooling.",
        "Reduced latency and improved dashboards.",
      ].join("\n"),
    ),
  });
  await page
    .getByLabel("I consent to recording and storing this interview for review.")
    .check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Resume parsed. Voice interview is ready.")).toBeVisible();
  await page.getByRole("button", { name: "Start voice interview" }).click();
  await expect(page.getByText("Complete").last()).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByText(candidateName)).toBeVisible();
  await page.getByText(candidateName).click();
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
