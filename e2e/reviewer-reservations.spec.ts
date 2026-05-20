import { expect, test, type BrowserContext } from "@playwright/test";
import { generateSessionCookie } from "@auth0/nextjs-auth0/testing";
import { createPdfFixture } from "../test/fixtures/pdf";

const auth0Secret =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const baseUrl = "http://localhost:3100";

async function addReviewerCookie(context: BrowserContext, email: string) {
  const sessionCookie = await generateSessionCookie(
    {
      user: {
        sub: `auth0|${email}`,
        name: email,
        email,
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
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test("reviewers reserve interviews and submit pass/fail without duplicates", async ({
  browser,
  context,
  page,
}) => {
  await addReviewerCookie(context, "admin@example.com");
  const candidateName = `Reservation Candidate ${Date.now()}`;

  await page.goto("/admin");
  await page.getByLabel("Role title").fill("Senior Backend Engineer");
  await page.getByLabel("Level").fill("L5");
  await page
    .getByLabel("Job description")
    .fill("Distributed systems, APIs, reliability, and ownership.");
  await page.getByRole("button", { name: "Create invite" }).click();

  const inviteInput = page.locator("input[readonly]");
  await expect(inviteInput).toHaveValue(/\/i\/inv_/);
  const inviteUrl = await inviteInput.inputValue();

  await page.goto(inviteUrl);
  await page.getByLabel("Name").fill(candidateName);
  await page.getByLabel("Email").fill("reservation@example.com");
  await page.getByLabel("Resume").setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: createPdfFixture([
      "Reservation Candidate",
      "reservation@example.com",
      "Led API migration from a monolith to services.",
      "Built TypeScript reliability tooling.",
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
  await expect(candidateCard.getByText("Available to reserve")).toBeVisible();
  await candidateCard.getByRole("button", { name: "Reserve" }).click();
  await expect(candidateCard.getByText("Reserved by you")).toBeVisible();
  await candidateCard.getByRole("link", { name: /Review interview/ }).click();
  await expect(page.getByRole("heading", { name: candidateName })).toBeVisible();
  await expect(page.getByText("Reserved by you")).toBeVisible();
  const reviewUrl = page.url();

  const reviewerTwoContext = await browser.newContext({ baseURL: baseUrl });
  await addReviewerCookie(reviewerTwoContext, "reviewer2@example.com");
  const reviewerTwoPage = await reviewerTwoContext.newPage();
  await reviewerTwoPage.goto(reviewUrl);
  await expect(
    reviewerTwoPage.getByText("Reserved by admin@example.com"),
  ).toBeVisible();
  await expect(
    reviewerTwoPage.getByRole("button", { name: "Reserve interview" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Pass" }).click();
  await expect(page.getByText("Decision: Pass")).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.locator("article").filter({ hasText: candidateName }).getByText("Passed"),
  ).toBeVisible();

  await reviewerTwoPage.reload();
  await expect(reviewerTwoPage.getByText("Decision: Pass")).toBeVisible();
  await reviewerTwoContext.close();
});
