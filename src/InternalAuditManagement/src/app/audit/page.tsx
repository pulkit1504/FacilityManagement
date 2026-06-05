import { FraudReview } from "@/components/audit/fraud-review";
import { AppShell } from "@/components/layout/app-shell";
import { AccessDeniedPanel } from "@/components/auth/access-denied-panel";
import { canAccessPage, requirePageAccess } from "@/server/auth/page-access";
import type { UserRole } from "@/server/domain/types";

const allowedRoles = ["Finance", "FinanceHOD", "MD"] satisfies UserRole[];

export default async function AuditPage() {
  const user = await requirePageAccess(allowedRoles);

  return (
    <AppShell>
      {!canAccessPage(user, allowedRoles) ? (
        <AccessDeniedPanel role={user.role} />
      ) : (
        <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Internal Audit</div>
          <h1>Fraud detection review</h1>
          <p className="muted">Duplicate vouchers, threshold splits, and non-operational day expenses surface here.</p>
        </div>
      </div>
      <FraudReview />
        </>
      )}
    </AppShell>
  );
}
