import { MyClaims } from "@/components/claims/my-claims";
import { AppShell } from "@/components/layout/app-shell";
import { AccessDeniedPanel } from "@/components/auth/access-denied-panel";
import { canAccessPage, requirePageAccess } from "@/server/auth/page-access";
import type { UserRole } from "@/server/domain/types";

const allowedRoles = ["Claimant", "ClusterHead", "HOD"] satisfies UserRole[];

export default async function ClaimsPage() {
  const user = await requirePageAccess(allowedRoles);

  return (
    <AppShell>
      {!canAccessPage(user, allowedRoles) ? (
        <AccessDeniedPanel role={user.role} />
      ) : (
        <>
      <div className="topbar">
        <div>
          <div className="eyebrow">My Claims</div>
          <h1>Claim history and status</h1>
          <p className="muted">Review your drafts, submitted claims, finance progress, and payment outcomes.</p>
        </div>
      </div>

      <MyClaims />
        </>
      )}
    </AppShell>
  );
}
