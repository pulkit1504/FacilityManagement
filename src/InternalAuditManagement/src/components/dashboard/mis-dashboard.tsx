"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { getProblemMessage } from "@/components/ui/problem-message";

type RecoveryMatrixRow = {
  siteName: string;
  totalBillable: number;
  totalBilled: number;
  recoveryPct: number | null;
};

type MisDashboardMetrics = {
  totalBillableApproved: number;
  totalBilled: number;
  unbilledLeakage: number;
  billingRecoveryPct: number | null;
  oldestBillingAlertDays: number | null;
  recoveryMatrix: RecoveryMatrixRow[];
};

export function MisDashboard() {
  const [metrics, setMetrics] = useState<MisDashboardMetrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/v1/dashboard/mis", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          setError(getProblemMessage(data, "Could not load MIS dashboard."));
          return;
        }

        setMetrics(data.metrics);
      } catch {
        setError("Could not load MIS dashboard. Check your connection and try again.");
      }
    }

    void load();
  }, []);

  if (error) {
    return <ActionFeedback message={error} tone="error" />;
  }

  if (!metrics) {
    return (
      <section className="panel">
        <span className="loading-inline">
          <Loader2 size={16} />
          Loading MIS dashboard...
        </span>
      </section>
    );
  }

  return (
    <>
      <div className="grid cols-3">
        <MetricCard label="Billable approved" value={formatCurrency(metrics.totalBillableApproved)} tone="success" />
        <MetricCard
          label="Unbilled leakage"
          value={formatCurrency(metrics.unbilledLeakage)}
          tone={metrics.unbilledLeakage > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Oldest alert"
          value={metrics.oldestBillingAlertDays === null ? "None" : `${metrics.oldestBillingAlertDays} days`}
          tone={metrics.oldestBillingAlertDays === null ? "success" : metrics.oldestBillingAlertDays >= 7 ? "danger" : "warning"}
        />
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
            {metrics.recoveryMatrix.map((row) => (
              <tr key={row.siteName}>
                <td>{row.siteName}</td>
                <td>{formatCurrency(row.totalBillable)}</td>
                <td>{formatCurrency(row.totalBilled)}</td>
                <td>
                  <span className={`badge ${recoveryTone(row.recoveryPct)}`}>
                    {row.recoveryPct === null ? "N/A" : `${row.recoveryPct}%`}
                  </span>
                </td>
              </tr>
            ))}
            {metrics.recoveryMatrix.length === 0 ? (
              <tr>
                <td colSpan={4}>No approved billable claims yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}

function formatCurrency(value: number) {
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function recoveryTone(value: number | null) {
  if (value === null || value >= 100) return "success";
  if (value >= 80) return "warning";
  return "danger";
}
