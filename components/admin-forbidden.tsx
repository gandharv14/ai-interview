import type { AdminAccessStatus } from "@/lib/server/admin";

type ForbiddenStatus = Extract<AdminAccessStatus, { status: "forbidden" }>;

const REASON_COPY: Record<ForbiddenStatus["reason"], string> = {
  not_allowlisted:
    "Your account isn't on the admin allowlist. Ask an existing admin to add your email to AUTH0_ADMIN_EMAILS.",
  email_unverified:
    "Your email isn't verified at the identity provider yet. Verify it and sign in again.",
  missing_allowlist:
    "AUTH0_ADMIN_EMAILS is not configured on this deployment, so no one can access the admin console. Set it in the Vercel environment variables (comma-separated list of admin emails) and redeploy.",
  missing_email:
    "The identity provider didn't return an email on the session. Ensure the OIDC `email` scope is requested.",
};

export function AdminForbidden({ status }: { status: ForbiddenStatus }) {
  const description = REASON_COPY[status.reason];

  return (
    <main className="shell grid min-h-screen place-items-center py-8">
      <section className="panel grid w-full max-w-xl gap-4 p-6">
        <div>
          <p className="muted text-sm font-bold uppercase tracking-wide">
            Interview Agent
          </p>
          <h1 className="mt-1 text-2xl font-bold">Access denied</h1>
          <p className="muted mt-2 text-sm">
            You're signed in
            {status.email ? (
              <>
                {" "}as <strong>{status.email}</strong>
              </>
            ) : null}
            , but you don't have permission to view the admin console.
          </p>
          <p className="muted mt-3 text-sm">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="button button-secondary" href="/auth/logout">
            Sign out
          </a>
        </div>
      </section>
    </main>
  );
}
