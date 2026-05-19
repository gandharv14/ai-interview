import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { isAdminSignedIn } from "@/lib/server/admin";
import { listInterviews } from "@/lib/server/store";

export default async function AdminPage() {
  const signedIn = await isAdminSignedIn();

  if (!signedIn) {
    redirect("/auth/login?returnTo=%2Fadmin");
  }

  const interviews = await listInterviews();
  return <AdminDashboard initialInterviews={interviews} />;
}
