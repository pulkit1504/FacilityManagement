import { ImprestWorkspace } from "@/components/imprest/imprest-workspace";
import { AppShell } from "@/components/layout/app-shell";

export default function ImprestPage() {
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Imprest Workflow</div>
          <h1>Advances and adjustments</h1>
          <p className="muted">Request advances, monitor open balances, and apply them to reimbursement claims.</p>
        </div>
      </div>
      <ImprestWorkspace />
    </AppShell>
  );
}
