import { FilePlus2 } from "lucide-react";
import { OverviewMetrics } from "@/components/dashboard/overview-metrics";
import { AppShell } from "@/components/layout/app-shell";

export default function Home() {
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
        <div className="actions">
          <a className="button" href="/claims/new">
            <FilePlus2 size={18} />
            New claim
          </a>
        </div>
      </div>

      <OverviewMetrics />
    </AppShell>
  );
}
