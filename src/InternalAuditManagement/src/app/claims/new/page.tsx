import { AppShell } from "@/components/layout/app-shell";
import { ClaimWizard } from "@/components/claims/claim-wizard";
import { AccessDeniedPanel } from "@/components/auth/access-denied-panel";
import { canAccessPage, requirePageAccess } from "@/server/auth/page-access";
import type { UserRole } from "@/server/domain/types";

const allowedRoles = ["Claimant", "ClusterHead", "HOD"] satisfies UserRole[];

export default async function NewClaimPage({
  searchParams
}: Readonly<{
  searchParams?: Promise<{ kind?: string; advanceClaimId?: string }>;
}>) {
  const user = await requirePageAccess(allowedRoles);
  const params = await searchParams;
  const initialClaimKind = params?.kind === "Settlement" ? "Settlement" : "Reimbursement";
  const initialAdvanceClaimId = params?.advanceClaimId;

  return (
    <AppShell>
      {!canAccessPage(user, allowedRoles) ? (
        <AccessDeniedPanel role={user.role} />
      ) : (
        <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Smart Intake</div>
          <h1>Create expense claim</h1>
          <p className="muted">Start with a draft, add itemized line details, then submit for routing.</p>
        </div>
      </div>
      <ClaimWizard initialClaimKind={initialClaimKind} initialAdvanceClaimId={initialAdvanceClaimId} />
        </>
      )}
    </AppShell>
  );
}
