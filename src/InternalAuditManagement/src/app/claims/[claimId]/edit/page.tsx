import { ClaimWizard } from "@/components/claims/claim-wizard";
import { AppShell } from "@/components/layout/app-shell";
import { AccessDeniedPanel } from "@/components/auth/access-denied-panel";
import { canAccessPage, requirePageAccess } from "@/server/auth/page-access";
import type { UserRole } from "@/server/domain/types";

type EditClaimPageProps = {
  params: Promise<{ claimId: string }>;
};

const allowedRoles = ["Claimant", "ClusterHead", "HOD"] satisfies UserRole[];

export default async function EditClaimPage({ params }: Readonly<EditClaimPageProps>) {
  const user = await requirePageAccess(allowedRoles);
  const { claimId } = await params;

  return (
    <AppShell>
      {!canAccessPage(user, allowedRoles) ? (
        <AccessDeniedPanel role={user.role} />
      ) : (
        <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Claim Workspace</div>
          <h1>Continue claim</h1>
          <p className="muted">Resume a draft or correct a returned claim before submitting it again.</p>
        </div>
      </div>
      <ClaimWizard initialClaimId={claimId} />
        </>
      )}
    </AppShell>
  );
}
