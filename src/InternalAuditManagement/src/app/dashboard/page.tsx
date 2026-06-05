import { AppShell } from "@/components/layout/app-shell";
import { AccessDeniedPanel } from "@/components/auth/access-denied-panel";
import { MisDashboard } from "@/components/dashboard/mis-dashboard";
import { canAccessPage, requirePageAccess } from "@/server/auth/page-access";
import type { UserRole } from "@/server/domain/types";

const allowedRoles = ["ClusterHead", "HOD", "MD", "Finance", "FinanceHOD", "BillingTeam", "Admin"] satisfies UserRole[];

export default async function DashboardPage() {
  const user = await requirePageAccess(allowedRoles);

  return (
    <AppShell>
      {!canAccessPage(user, allowedRoles) ? (
        <AccessDeniedPanel role={user.role} />
      ) : (
        <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Management MIS</div>
          <h1>Billing recovery and audit visibility</h1>
          <p className="muted">Live recovery metrics from approved claims, billing alerts, and finance progress.</p>
        </div>
      </div>

      <MisDashboard />
        </>
      )}
    </AppShell>
  );
}
