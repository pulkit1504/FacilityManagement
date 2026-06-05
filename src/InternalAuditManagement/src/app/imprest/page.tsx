import { ImprestWorkspace } from "@/components/imprest/imprest-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { AccessDeniedPanel } from "@/components/auth/access-denied-panel";
import { canAccessPage, requirePageAccess } from "@/server/auth/page-access";
import type { UserRole } from "@/server/domain/types";

const allowedRoles = ["Claimant", "ClusterHead", "HOD"] satisfies UserRole[];

export default async function ImprestPage() {
  const user = await requirePageAccess(allowedRoles);

  return (
    <AppShell>
      {!canAccessPage(user, allowedRoles) ? (
        <AccessDeniedPanel role={user.role} />
      ) : (
        <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Imprest Workflow</div>
          <h1>Advance and settlement</h1>
          <p className="muted">Request advances, monitor open balances, and start settlement claims.</p>
        </div>
      </div>
      <ImprestWorkspace />
        </>
      )}
    </AppShell>
  );
}
