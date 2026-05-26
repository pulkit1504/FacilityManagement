import { ArrowRight, FilePlus2 } from "lucide-react";
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
          <a className="button secondary" href="/dashboard">
            View dashboard
            <ArrowRight size={18} />
          </a>
        </div>
      </div>

      <OverviewMetrics />

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Active MVP Scope</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Production control</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Claims", "Single voucher and proforma line-item entry", "Foundation ready"],
              ["Approvals", "HOD/MD routing with segregation checks", "Next build step"],
              ["Finance", "Physical voucher gate before payment release", "Next build step"],
              ["Billing", "Pending billing alerts and recovery ratio", "Next build step"],
              ["Audit", "Append-only action log for every workflow event", "Foundation ready"]
            ].map(([module, control, status]) => (
              <tr key={module}>
                <td>
                  <strong>{module}</strong>
                </td>
                <td>{control}</td>
                <td>
                  <span className="badge success">{status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
