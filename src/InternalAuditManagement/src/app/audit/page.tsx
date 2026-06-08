import { FraudReview } from "@/components/audit/fraud-review";
import { AppShell } from "@/components/layout/app-shell";
import { getUserContext, requireRole } from "@/server/auth/user-context";

export default async function AuditPage() {
  requireRole(await getUserContext(), ["Auditor", "MD"]);
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Internal Audit</div>
          <h1>Audit dashboard</h1>
          <p className="muted">Monitor audit risk, run sweeps, and close fraud review actions from one workspace.</p>
        </div>
      </div>
      <FraudReview />
    </AppShell>
  );
}
