import { CandidateInterviewFlow } from "@/components/candidate-interview-flow";
import {
  hashInviteToken,
  verifyInviteTokenSignature,
} from "@/lib/server/security";
import { getInviteByTokenHash } from "@/lib/server/store";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function CandidateInvitePage({ params }: Props) {
  const { token } = await params;
  const validSignature = verifyInviteTokenSignature(token);
  const invite = validSignature
    ? await getInviteByTokenHash(hashInviteToken(token))
    : undefined;

  if (!invite || invite.status !== "active") {
    return (
      <main className="shell grid min-h-screen place-items-center py-8">
        <section className="panel max-w-lg p-6">
          <h1 className="text-2xl font-bold">Invite Unavailable</h1>
          <p className="muted mt-2">
            This interview link is invalid, expired, or already used.
          </p>
        </section>
      </main>
    );
  }

  return (
    <CandidateInterviewFlow
      token={token}
      roleTitle={invite.roleTitle}
      level={invite.level}
    />
  );
}
