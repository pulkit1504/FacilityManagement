import { AppShell } from "@/components/layout/app-shell";
import { ApprovalQueue } from "@/components/approvals/approval-queue";

export default function ApprovalsPage() {
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Approval Routing</div>
          <h1>Operational approvals</h1>
          <p className="muted">Approve valid claims or return them with an audit-tracked reason.</p>
        </div>
      </div>
      <ApprovalQueue />
    </AppShell>
  );
}
