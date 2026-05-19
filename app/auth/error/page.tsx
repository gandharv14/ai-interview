type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const params = await searchParams;
  const message =
    typeof params.message === "string"
      ? params.message
      : "The authentication session could not be completed.";

  return (
    <main className="shell grid min-h-screen place-items-center py-8">
      <section className="panel grid w-full max-w-md gap-4 p-6">
        <div>
          <p className="muted text-sm font-bold uppercase tracking-wide">
            Interview Agent
          </p>
          <h1 className="mt-1 text-2xl font-bold">Authentication failed</h1>
          <p className="muted mt-2 text-sm">{message}</p>
        </div>
        <a className="button button-primary" href="/auth/login?returnTo=%2Fadmin">
          Try signing in again
        </a>
      </section>
    </main>
  );
}
