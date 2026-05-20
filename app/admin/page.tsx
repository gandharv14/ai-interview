import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminForbidden } from "@/components/admin-forbidden";
import { getAdminAccessStatus } from "@/lib/server/admin";
import { listInterviews, StoreSetupError } from "@/lib/server/store";

export default async function AdminPage() {
  const access = await getAdminAccessStatus();

  if (access.status === "unauthenticated") {
    redirect("/auth/login?returnTo=%2Fadmin");
  }
  if (access.status === "forbidden") {
    return <AdminForbidden status={access} />;
  }

  let interviews;
  try {
    interviews = await listInterviews();
  } catch (error) {
    const setupIssue = getDatabaseSetupIssue(error);
    if (setupIssue) {
      return <DatabaseSetupRequired issue={setupIssue} />;
    }
    throw error;
  }

  return <AdminDashboard initialInterviews={interviews} />;
}

function isMissingSupabaseTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST205"
  );
}

type DatabaseSetupIssue = {
  title: string;
  message: string;
  detail?: string;
};

export function getDatabaseSetupIssue(
  error: unknown,
): DatabaseSetupIssue | undefined {
  if (error instanceof StoreSetupError) {
    if (error.reason === "missing_supabase_config") {
      return {
        title: "Database setup required",
        message:
          "This deployment needs Supabase before the admin console can load. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the deployment environment, then redeploy.",
      };
    }

    return {
      title: "Supabase configuration issue",
      message:
        "The admin console could not create the Supabase server client. Check that SUPABASE_URL is valid and SUPABASE_SERVICE_ROLE_KEY is the service_role JWT from Supabase.",
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

function DatabaseSetupRequired({ issue }: { issue: DatabaseSetupIssue }) {
  return (
    <main className="shell grid min-h-screen place-items-center py-8">
      <section className="panel grid w-full max-w-xl gap-4 p-6">
        <div>
          <p className="muted text-sm font-bold uppercase tracking-wide">
            Interview Agent
          </p>
          <h1 className="mt-1 text-2xl font-bold">{issue.title}</h1>
          <p className="muted mt-2 text-sm">{issue.message}</p>
          {issue.detail ? (
            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">
              {issue.detail}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
