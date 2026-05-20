import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { isAdminSignedIn } from "@/lib/server/admin";

export default async function HomePage() {
  const signedIn = await isAdminSignedIn();

  return (
    <main className="shell grid min-h-screen place-items-center py-12">
      <section className="panel panel-strong grid w-full max-w-3xl gap-5 p-7 sm:p-9">
        <p className="section-kicker">Interview Agent</p>
        <h1 className="page-title">
          Resume-custom voice interviews for software engineering roles
        </h1>
        <p className="muted">
          Candidates open a one-time invite link, upload their resume, and
          step into a voice interview tailored to their projects. Admins
          create invites and review recordings, transcripts, and reviewer
          summaries.
        </p>
        <div className="flex flex-wrap gap-3">
          {signedIn ? (
            <Link className="button button-secondary" href="/admin">
              Go to admin console
              <ArrowRight size={16} aria-hidden />
            </Link>
          ) : (
            <Link
              className="button button-secondary"
              href="/auth/login?returnTo=%2Fadmin"
            >
              Admin sign in
              <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </div>
        <p className="muted mt-2 text-xs">
          Candidates: use the invite link your interviewer sent you. This
          page does not start interviews directly.
        </p>
      </section>
    </main>
  );
}
