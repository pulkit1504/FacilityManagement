import { AppShell } from "@/components/layout/app-shell";
import { FinanceQueue } from "@/components/finance/finance-queue";
import { AccessDeniedPanel } from "@/components/auth/access-denied-panel";
import { canAccessPage, requirePageAccess } from "@/server/auth/page-access";
import type { UserRole } from "@/server/domain/types";

const allowedRoles = ["Finance", "FinanceHOD"] satisfies UserRole[];

export default async function FinancePage() {
  const user = await requirePageAccess(allowedRoles);

  return (
    <AppShell>
      {!canAccessPage(user, allowedRoles) ? (
        <AccessDeniedPanel role={user.role} />
      ) : (
        <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Finance Reconciliation</div>
          <h1>Receipt gate and payment release</h1>
          <p className="muted">Payment cannot be released until original voucher receipt is confirmed.</p>
        </div>
      </div>
      <FinanceQueue />
        </>
      )}
    </AppShell>
  );
}
