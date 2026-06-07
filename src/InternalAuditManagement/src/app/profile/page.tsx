import { AppShell } from "@/components/layout/app-shell";
import { EmployeeProfile } from "@/components/profile/employee-profile";
import { getUserContext, requireRole } from "@/server/auth/user-context";

export default async function ProfilePage() {
  requireRole(await getUserContext(), ["Claimant", "ClusterHead", "HOD"]);
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Self Service</div>
          <h1>My profile</h1>
          <p className="muted">Review linked sites and employees, and keep bank details current.</p>
        </div>
      </div>
      <EmployeeProfile />
    </AppShell>
  );
}
