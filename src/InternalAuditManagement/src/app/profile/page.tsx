import { AppShell } from "@/components/layout/app-shell";
import { EmployeeProfile } from "@/components/profile/employee-profile";
import { getUserContext, requireRole } from "@/server/auth/user-context";
import { userRoles } from "@/server/domain/types";

export default async function ProfilePage() {
  requireRole(await getUserContext(), [...userRoles]);
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Self Service</div>
          <h1>My profile</h1>
          <p className="muted">Review your profile, keep security current, and manage eligible self-service details.</p>
        </div>
      </div>
      <EmployeeProfile />
    </AppShell>
  );
}
