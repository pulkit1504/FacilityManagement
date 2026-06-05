import { FilePlus2 } from "lucide-react";
import { OverviewMetrics } from "@/components/dashboard/overview-metrics";
import { AppShell } from "@/components/layout/app-shell";
import { requirePageAccess } from "@/server/auth/page-access";
import type { UserRole } from "@/server/domain/types";

const claimCreatorRoles: readonly UserRole[] = ["Claimant", "ClusterHead", "HOD"];

export default async function Home() {
  const user = await requirePageAccess();

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">MVP Control Room</div>
          <h1>Facility expense control for residential society operations</h1>
          <p className="muted">
            Submit itemized claims, route approvals, track physical vouchers, recover billable expenses, and preserve
            an immutable audit trail.
          </p>
        </div>
        {claimCreatorRoles.includes(user.role) ? (
          <div className="actions">
            <a className="button" href="/claims/new">
              <FilePlus2 size={18} />
              New claim
            </a>
          </div>
        ) : null}
      </div>

      <OverviewMetrics />
    </AppShell>
  );
}
