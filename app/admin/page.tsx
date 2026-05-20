import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminForbidden } from "@/components/admin-forbidden";
import { getAdminAccessStatus } from "@/lib/server/admin";
import { listInterviews } from "@/lib/server/store";

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
    if (isMissingSupabaseTableError(error)) {
      return <DatabaseSetupRequired />;
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

function DatabaseSetupRequired() {
  return (
    <main className="shell grid min-h-screen place-items-center py-8">
      <section className="panel grid w-full max-w-xl gap-4 p-6">
        <div>
          <p className="muted text-sm font-bold uppercase tracking-wide">
            Interview Agent
          </p>
          <h1 className="mt-1 text-2xl font-bold">Database setup required</h1>
          <p className="muted mt-2 text-sm">
            Supabase is connected, but the interview tables are not available yet.
            Run the SQL migration in{" "}
            <code>supabase/migrations/0001_interview_agent.sql</code>, then
            refresh this page.
          </p>
        </div>
      </section>
    </main>
  );
}
