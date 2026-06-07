import { BillingAlerts } from "@/components/billing/billing-alerts";
import { AppShell } from "@/components/layout/app-shell";
import { getUserContext, requireRole } from "@/server/auth/user-context";

export default async function BillingPage() {
  requireRole(await getUserContext(), ["BillingTeam", "Finance", "FinanceHOD"]);
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Revenue Recovery</div>
          <h1>Billing alerts</h1>
          <p className="muted">Track B2C - Pending Billing expenses until a client invoice number is linked.</p>
        </div>
      </div>
      <BillingAlerts />
    </AppShell>
  );
}
