import { expect, test } from "@playwright/test";
import { generateSessionCookie } from "@auth0/nextjs-auth0/testing";
import path from "node:path";
import { URL } from "node:url";

const auth0Secret = process.env.AUTH0_SECRET;
const resumePath = process.env.MANUAL_SUPABASE_RESUME_PATH;
const candidateName = process.env.MANUAL_SUPABASE_CANDIDATE_NAME ?? "GV";
const candidateEmail =
  process.env.MANUAL_SUPABASE_CANDIDATE_EMAIL ?? "gmahajan@labelbox.com";

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(
    !auth0Secret,
    "AUTH0_SECRET must be set (use the dev server's value).",
  );
  test.skip(
    !resumePath,
    "MANUAL_SUPABASE_RESUME_PATH must point to a real PDF resume.",
  );
  const cookie = await generateSessionCookie(
    {
      user: {
        sub: "auth0|manual-supabase-admin",
        name: candidateName,
        email: candidateEmail,
      },
      tokenSet: {
        accessToken: "manual-supabase-access-token",
        expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
      },
    },
    { secret: auth0Secret! },
  );
  await context.addCookies([
    {
      name: "__session",
      value: cookie,
      url: baseURL!,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});

test("admin creates invite and candidate uploads a real resume against Supabase", async ({
  page,
  baseURL,
}) => {
  page.on("response", async (response) => {
    if (
      response.url().endsWith("/api/interviews/start") &&
      response.status() !== 200
    ) {
      const body = await response.text().catch(() => "<no body>");
      console.error(
        `[interviews/start] ${response.status()} ${response.url()}: ${body}`,
      );
    }
  });
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
  const invitePath = new URL(inviteUrl, baseURL!).pathname;

  await page.goto(invitePath);
  await page.getByLabel("Name").fill(candidateName);
  await page.getByLabel("Email").fill(candidateEmail);
  await page
    .getByLabel("Resume")
    .setInputFiles(path.resolve(resumePath!));
  await page
    .getByLabel("I consent to recording and storing this interview for review.")
    .check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByText("Resume parsed. Voice interview is ready."),
  ).toBeVisible({ timeout: 60_000 });

  await page.goto("/admin");
  await expect(page.getByText(candidateName).first()).toBeVisible();
});
