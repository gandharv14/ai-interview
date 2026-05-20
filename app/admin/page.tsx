import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminForbidden } from "@/components/admin-forbidden";
import { getAdminAccessStatus } from "@/lib/server/admin";
import { listInterviews } from "@/lib/server/store";
import { getDatabaseSetupIssue } from "@/lib/server/store-setup";
import type { Interview, SetupIssue } from "@/lib/types";

export default async function AdminPage() {
  const access = await getAdminAccessStatus();

  if (access.status === "unauthenticated") {
    redirect("/auth/login?returnTo=%2Fadmin");
  }
  if (access.status === "forbidden") {
    return <AdminForbidden status={access} />;
  }

  let interviews: Interview[];
  let setupIssue: SetupIssue | undefined;
  try {
    interviews = await listInterviews();
  } catch (error) {
    setupIssue = getDatabaseSetupIssue(error);
    if (setupIssue) interviews = [];
    else throw error;
  }

  return (
    <AdminDashboard
      initialInterviews={interviews}
      reviewerEmail={access.email}
      setupIssue={setupIssue}
    />
  );
}
