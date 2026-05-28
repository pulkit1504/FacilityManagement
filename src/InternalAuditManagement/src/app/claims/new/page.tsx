import { AppShell } from "@/components/layout/app-shell";
import { ClaimWizard } from "@/components/claims/claim-wizard";

export default async function NewClaimPage({
  searchParams
}: Readonly<{
  searchParams?: Promise<{ kind?: string; advanceClaimId?: string }>;
}>) {
  const params = await searchParams;
  const initialClaimKind = params?.kind === "Settlement" ? "Settlement" : "Reimbursement";
  const initialAdvanceClaimId = params?.advanceClaimId;

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Smart Intake</div>
          <h1>Create expense claim</h1>
          <p className="muted">Start with a draft, add itemized line details, then submit for routing.</p>
        </div>
      </div>
      <ClaimWizard initialClaimKind={initialClaimKind} initialAdvanceClaimId={initialAdvanceClaimId} />
    </AppShell>
  );
}
