import { AdminDashboard } from "@/components/admin-dashboard";
import { isAdminSignedIn } from "@/lib/server/admin";
import { listInterviews } from "@/lib/server/store";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: Props) {
  const signedIn = await isAdminSignedIn();
  const params = await searchParams;
  const hasError = params.error === "1";

  if (!signedIn) {
    return (
      <main className="shell grid min-h-screen place-items-center py-8">
        <form className="panel grid w-full max-w-md gap-4 p-6" action="/api/admin/login" method="post">
          <div>
            <p className="muted text-sm font-bold uppercase tracking-wide">
              Interview Agent
            </p>
            <h1 className="mt-1 text-2xl font-bold">Reviewer Sign In</h1>
          </div>
          <input type="hidden" name="redirectTo" value="/admin" />
          <div className="field">
            <label htmlFor="passphrase">Admin passphrase</label>
            <input
              id="passphrase"
              name="passphrase"
              type="password"
              className="input"
              autoComplete="current-password"
              required
            />
          </div>
          {hasError ? (
            <p className="text-sm font-bold text-red-700">Invalid passphrase.</p>
          ) : null}
          <button className="button button-primary" type="submit">
            Sign in
          </button>
        </form>
      </main>
    );
  }

  const interviews = await listInterviews();
  return <AdminDashboard initialInterviews={interviews} />;
}
