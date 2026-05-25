import { AppShell } from "@/components/layout/app-shell";
import { ClaimWizard } from "@/components/claims/claim-wizard";

export default function NewClaimPage() {
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Smart Intake</div>
          <h1>Create expense claim</h1>
          <p className="muted">Start with a draft, add itemized line details, then submit for routing.</p>
        </div>
      </div>
      <ClaimWizard />
    </AppShell>
  );
}
