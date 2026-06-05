import { AppShell } from "@/components/layout/app-shell";
import { ApprovalQueue } from "@/components/approvals/approval-queue";
import { AccessDeniedPanel } from "@/components/auth/access-denied-panel";
import { canAccessPage, requirePageAccess } from "@/server/auth/page-access";
import type { UserRole } from "@/server/domain/types";

const allowedRoles = ["ClusterHead", "HOD", "MD"] satisfies UserRole[];

export default async function ApprovalsPage() {
  const user = await requirePageAccess(allowedRoles);

  return (
    <AppShell>
      {!canAccessPage(user, allowedRoles) ? (
        <AccessDeniedPanel role={user.role} />
      ) : (
        <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Approval Routing</div>
          <h1>Operational approvals</h1>
          <p className="muted">Approve valid claims or return them with an audit-tracked reason.</p>
        </div>
      </div>
      <ApprovalQueue />
        </>
      )}
    </AppShell>
  );
}
