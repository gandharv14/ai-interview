import "server-only";

import { StoreSetupError } from "@/lib/server/store";
import type { SetupIssue } from "@/lib/types";

export function getDatabaseSetupIssue(error: unknown): SetupIssue | undefined {
  if (error instanceof StoreSetupError) {
    if (error.reason === "missing_supabase_config") {
      return {
        title: "Database setup required",
        message:
          "This deployment needs Supabase before database-backed admin actions can run. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the deployment environment, then redeploy.",
      };
    }

    return {
      title: "Supabase configuration issue",
      message:
        "Auth0 login succeeded, but the admin console could not create the Supabase server client. Check that SUPABASE_URL is valid and SUPABASE_SERVICE_ROLE_KEY is the service_role JWT from Supabase.",
      detail: error.message,
    };
  }

  if (isMissingSupabaseTableError(error)) {
    return {
      title: "Database setup required",
      message:
        "Supabase is connected, but the interview tables are not available yet. Run the SQL migration in supabase/migrations/0001_interview_agent.sql, then refresh this page.",
    };
  }

  return undefined;
}

function isMissingSupabaseTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST205"
  );
}
