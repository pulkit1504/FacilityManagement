import { FraudReview } from "@/components/audit/fraud-review";
import { AppShell } from "@/components/layout/app-shell";

export default function AuditPage() {
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Internal Audit</div>
          <h1>Fraud detection review</h1>
          <p className="muted">Duplicate vouchers, threshold splits, and non-operational day expenses surface here.</p>
        </div>
      </div>
      <FraudReview />
    </AppShell>
  );
}
