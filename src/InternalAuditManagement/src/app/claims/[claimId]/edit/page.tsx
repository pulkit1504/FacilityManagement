import { ClaimWizard } from "@/components/claims/claim-wizard";
import { AppShell } from "@/components/layout/app-shell";

type EditClaimPageProps = {
  params: Promise<{ claimId: string }>;
};

export default async function EditClaimPage({ params }: Readonly<EditClaimPageProps>) {
  const { claimId } = await params;

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Claim Workspace</div>
          <h1>Continue claim</h1>
          <p className="muted">Resume a draft or correct a returned claim before submitting it again.</p>
        </div>
      </div>
      <ClaimWizard initialClaimId={claimId} />
    </AppShell>
  );
}
