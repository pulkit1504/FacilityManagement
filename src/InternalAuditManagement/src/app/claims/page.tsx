import { MyClaims } from "@/components/claims/my-claims";
import { AppShell } from "@/components/layout/app-shell";

export default function ClaimsPage() {
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">My Claims</div>
          <h1>Claim history and status</h1>
          <p className="muted">Review your drafts, submitted claims, finance progress, and payment outcomes.</p>
        </div>
      </div>

      <MyClaims />
    </AppShell>
  );
}
