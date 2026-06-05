import { BillingAlerts } from "@/components/billing/billing-alerts";
import { AppShell } from "@/components/layout/app-shell";
import { AccessDeniedPanel } from "@/components/auth/access-denied-panel";
import { canAccessPage, requirePageAccess } from "@/server/auth/page-access";
import type { UserRole } from "@/server/domain/types";

const allowedRoles = ["BillingTeam", "Finance", "FinanceHOD"] satisfies UserRole[];

export default async function BillingPage() {
  const user = await requirePageAccess(allowedRoles);

  return (
    <AppShell>
      {!canAccessPage(user, allowedRoles) ? (
        <AccessDeniedPanel role={user.role} />
      ) : (
        <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Revenue Recovery</div>
          <h1>Billing alerts</h1>
          <p className="muted">Track Pending Billing expenses until a client invoice number is linked.</p>
        </div>
      </div>
      <BillingAlerts />
        </>
      )}
    </AppShell>
  );
}
