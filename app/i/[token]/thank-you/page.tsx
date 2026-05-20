import {
  hashInviteToken,
  verifyInviteTokenSignature,
} from "@/lib/server/security";
import { getInviteByTokenHash } from "@/lib/server/store";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function InterviewThankYouPage({ params }: Props) {
  const { token } = await params;
  const validSignature = verifyInviteTokenSignature(token);
  const invite = validSignature
    ? await getInviteByTokenHash(hashInviteToken(token))
    : undefined;

  return (
    <main className="shell grid min-h-screen place-items-center py-8">
      <section className="panel max-w-lg p-6 text-center">
        <h1 className="text-3xl font-bold">Thank You for Taking the Interview</h1>
        <p className="muted mt-3">
          Your interview has been submitted successfully. You can now close this
          window.
        </p>
        {invite ? (
          <p className="mt-4 text-sm font-bold">
            {invite.roleTitle} · {invite.level}
          </p>
        ) : null}
      </section>
    </main>
  );
}
