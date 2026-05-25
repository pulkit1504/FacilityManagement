import { AppShell } from "@/components/layout/app-shell";
import { MetricCard } from "@/components/ui/metric-card";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Management MIS</div>
          <h1>Billing recovery and audit visibility</h1>
          <p className="muted">The live dashboard will read from PostgreSQL views and fraud-review queues.</p>
        </div>
      </div>

      <div className="grid cols-3">
        <MetricCard label="Billable approved" value="Rs 45,000" tone="success" />
        <MetricCard label="Unbilled leakage" value="Rs 7,000" tone="warning" />
        <MetricCard label="Oldest alert" value="7 days" tone="danger" />
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Recovery Matrix</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Client contract</th>
              <th>Total billable</th>
              <th>Total billed</th>
              <th>Recovery</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ansal Heights</td>
              <td>Rs 45,000</td>
              <td>Rs 38,000</td>
              <td>
                <span className="badge warning">84%</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
