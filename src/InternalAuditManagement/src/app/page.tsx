import { FilePlus2 } from "lucide-react";
import { OverviewMetrics } from "@/components/dashboard/overview-metrics";
import { RoleControlRoom } from "@/components/dashboard/role-control-room";
import { AppShell } from "@/components/layout/app-shell";
import { getUserContext } from "@/server/auth/user-context";

export default async function Home() {
  const user = await getUserContext();
  const canCreateClaim = ["Claimant", "ClusterHead", "HOD"].includes(user.role);
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Imprest Claim</div>
          <h1>Imprest Claim control room</h1>
          <p className="muted">
            Submit itemized claims, route approvals, track physical vouchers, recover billable expenses, and preserve
            an immutable audit trail.
          </p>
        </div>
        {canCreateClaim ? <div className="actions">
          <a className="button" href="/claims/new">
            <FilePlus2 size={18} />
            New claim
          </a>
        </div> : null}
      </div>

      <OverviewMetrics />
      <RoleControlRoom role={user.role} />
    </AppShell>
  );
}
