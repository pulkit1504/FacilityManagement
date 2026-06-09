import { AppShell } from "@/components/layout/app-shell";
import { MisDashboard } from "@/components/dashboard/mis-dashboard";
import { getUserContext, requireRole } from "@/server/auth/user-context";

export default async function DashboardPage() {
  requireRole(await getUserContext(), ["MD", "Finance", "BillingTeam", "Admin"]);
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Management MIS</div>
          <h1>Billing recovery and audit visibility</h1>
          <p className="muted">Live recovery metrics from approved claims, billing alerts, and finance progress.</p>
        </div>
      </div>

      <MisDashboard />
    </AppShell>
  );
}
