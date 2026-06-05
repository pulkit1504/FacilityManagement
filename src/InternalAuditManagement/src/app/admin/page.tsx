import { SiteContractAdmin } from "@/components/admin/site-contract-admin";
import { AppShell } from "@/components/layout/app-shell";
import { AccessDeniedPanel } from "@/components/auth/access-denied-panel";
import { canAccessPage, requirePageAccess } from "@/server/auth/page-access";
import type { UserRole } from "@/server/domain/types";

const allowedRoles = ["Admin"] satisfies UserRole[];

export default async function AdminPage() {
  const user = await requirePageAccess(allowedRoles);

  return (
    <AppShell>
      {!canAccessPage(user, allowedRoles) ? (
        <AccessDeniedPanel role={user.role} />
      ) : (
        <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Administration</div>
          <h1>Operational setup</h1>
          <p className="muted">Maintain employees, approvers, holidays, sites, and client contracts.</p>
        </div>
      </div>

      <SiteContractAdmin />
        </>
      )}
    </AppShell>
  );
}
