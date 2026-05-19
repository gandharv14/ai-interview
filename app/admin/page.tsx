import { AdminDashboard } from "@/components/admin-dashboard";
import { isAdminSignedIn } from "@/lib/server/admin";
import { listInterviews } from "@/lib/server/store";

export default async function AdminPage() {
  const signedIn = await isAdminSignedIn();

  if (!signedIn) {
    return (
      <main className="shell grid min-h-screen place-items-center py-8">
        <div className="panel grid w-full max-w-md gap-4 p-6">
          <div>
            <p className="muted text-sm font-bold uppercase tracking-wide">
              Interview Agent
            </p>
            <h1 className="mt-1 text-2xl font-bold">Reviewer Sign In</h1>
            <p className="muted mt-2 text-sm">
              Use your configured Auth0 application to access the reviewer console.
            </p>
          </div>
          <a className="button button-primary" href="/auth/login?returnTo=%2Fadmin">
            Sign in with Auth0
          </a>
        </div>
      </main>
    );
  }

  const interviews = await listInterviews();
  return <AdminDashboard initialInterviews={interviews} />;
}
