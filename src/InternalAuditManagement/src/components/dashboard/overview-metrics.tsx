"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { getProblemMessage } from "@/components/ui/problem-message";

type OverviewMetrics = {
  pendingApprovals: number;
  financeQueueCount: number;
  activeBillingAlerts: number;
  openFraudFlags: number;
  billingRecoveryPct: number | null;
};

export function OverviewMetrics() {
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/v1/dashboard/overview", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          setError(getProblemMessage(data, "Could not load overview metrics."));
          return;
        }
        setMetrics(data.metrics);
      } catch {
        setError("Could not load overview metrics. Check your connection and try again.");
      }
    }

    void load();
  }, []);

  if (error) {
    return <ActionFeedback message={error} tone="error" />;
  }

  if (!metrics) {
    return (
      <div className="grid cols-3">
        <section className="card metric">
          <span className="loading-inline">
            <Loader2 size={16} />
            Loading overview...
          </span>
        </section>
      </div>
    );
  }

  return (
    <div className="grid cols-3">
      <MetricCard label="Pending approvals" value={String(metrics.pendingApprovals)} tone={metrics.pendingApprovals > 0 ? "warning" : "success"} />
      <MetricCard label="Finance queue" value={String(metrics.financeQueueCount)} tone={metrics.financeQueueCount > 0 ? "warning" : "success"} />
      <MetricCard
        label="Billing recovery"
        value={metrics.billingRecoveryPct === null ? "N/A" : `${metrics.billingRecoveryPct}%`}
        tone={metrics.billingRecoveryPct === null || metrics.billingRecoveryPct >= 100 ? "success" : metrics.billingRecoveryPct >= 80 ? "warning" : "danger"}
      />
      <MetricCard label="Billing alerts" value={String(metrics.activeBillingAlerts)} tone={metrics.activeBillingAlerts > 0 ? "warning" : "success"} />
      <MetricCard label="Open fraud flags" value={String(metrics.openFraudFlags)} tone={metrics.openFraudFlags > 0 ? "danger" : "success"} />
    </div>
  );
}
