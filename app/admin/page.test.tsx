import { describe, expect, it } from "vitest";
import { getDatabaseSetupIssue } from "@/app/admin/page";
import { StoreSetupError } from "@/lib/server/store";

describe("getDatabaseSetupIssue", () => {
  it("maps missing production Supabase config to an admin setup screen", () => {
    const issue = getDatabaseSetupIssue(
      new StoreSetupError(
        "missing_supabase_config",
        "Supabase env vars are required in production",
      ),
    );

    expect(issue).toMatchObject({
      title: "Database setup required",
      message: expect.stringContaining("SUPABASE_URL"),
    });
  });

  it("maps invalid Supabase config to an actionable setup screen", () => {
    const issue = getDatabaseSetupIssue(
      new StoreSetupError(
        "invalid_supabase_config",
        "SUPABASE_SERVICE_ROLE_KEY is not a valid JWT.",
      ),
    );

    expect(issue).toMatchObject({
      title: "Supabase configuration issue",
      message: expect.stringContaining("service_role"),
      detail: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
    });
  });

  it("maps missing Supabase tables to the migration setup screen", () => {
    const issue = getDatabaseSetupIssue({ code: "PGRST205" });

    expect(issue).toMatchObject({
      title: "Database setup required",
      message: expect.stringContaining(
        "supabase/migrations/0001_interview_agent.sql",
      ),
    });
  });

  it("leaves unknown errors for the route error boundary", () => {
    expect(getDatabaseSetupIssue(new Error("boom"))).toBeUndefined();
  });
});
