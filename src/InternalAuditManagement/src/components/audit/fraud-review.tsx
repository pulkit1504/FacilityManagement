"use client";

import { Fragment, useEffect, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Eye, Loader2, Play, ShieldAlert } from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { expenseTagLabel } from "@/shared/expense-tags";
import { MetricCard } from "@/components/ui/metric-card";
import { getProblemMessage } from "@/components/ui/problem-message";

type FraudFlagItem = {
  flagId: string;
  primaryClaimId: string;
  ruleName: "DuplicateVoucher" | "ThresholdSplit" | "WeekendOutlier";
  ruleLabel: string;
  ruleDescription: string;
  relatedClaimCount: number;
  daysOpen: number;
  employeeName: string;
  flaggedLineItems: Array<{
    claimId: string;
    lineItemId: string;
    description: string;
    amount: number;
    transactionDate: string;
    expenseTag: string;
    clientInvoiceNumber: string | null;
    missingReceiptFlag: boolean;
  }>;
};

export function FraudReview() {
  const [flags, setFlags] = useState<FraudFlagItem[]>([]);
  const [expandedFlagId, setExpandedFlagId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const highPriorityFlags = flags.filter((flag) => flag.daysOpen >= 7);
  const agedFlags = flags.filter((flag) => flag.daysOpen >= 2);
  const evidenceLineCount = flags.reduce((sum, flag) => sum + flag.flaggedLineItems.length, 0);
  const ruleCounts = flags.reduce<Record<string, number>>((acc, flag) => {
    acc[flag.ruleLabel] = (acc[flag.ruleLabel] ?? 0) + 1;
    return acc;
  }, {});

  async function load() {
    try {
      setIsLoading(true);
      const response = await fetch("/api/v1/fraud/flags?status=Open");
      const data = await response.json();
      if (!response.ok) {
        setMessage(getProblemMessage(data, "Could not load fraud flags."));
        return;
      }
      setFlags(data.flags ?? []);
    } catch {
      setMessage("Could not load fraud flags. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runSweep() {
    setBusyAction("sweep");
    setMessage("Running fraud sweep...");
    try {
      const response = await fetch("/api/v1/fraud/sweep", { method: "POST" });
      const data = await response.json();
      setMessage(
        response.ok
          ? `Sweep complete. ${data.createdFlagsCount} new flags from ${data.evaluatedClaims} claims.`
          : getProblemMessage(data, "Sweep failed.")
      );
      if (response.ok) await load();
    } catch {
      setMessage("Fraud sweep failed. Check your connection and try again.");
    } finally {
      setBusyAction(null);
    }
  }

  async function review(flagId: string, decision: "Cleared" | "Escalated") {
    setBusyAction(`${decision}:${flagId}`);
    setMessage(decision === "Cleared" ? "Clearing fraud flag..." : "Escalating fraud flag...");
    try {
      const response = await fetch(`/api/v1/fraud/flags/${flagId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          remarks: decision === "Cleared" ? "Reviewed and found legitimate." : "Escalated for management review."
        })
      });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, "Flag updated."));
      if (response.ok) await load();
    } catch {
      setMessage("Could not update the fraud flag. Check your connection and try again.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid cols-3">
        <MetricCard label="Open audit flags" value={String(flags.length)} tone={flags.length > 0 ? "warning" : "success"} />
        <MetricCard label="High priority" value={String(highPriorityFlags.length)} tone={highPriorityFlags.length > 0 ? "danger" : "success"} />
        <MetricCard label="Evidence lines" value={String(evidenceLineCount)} tone={evidenceLineCount > 0 ? "warning" : "success"} />
      </div>

      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Audit Command Center</h2>
            <p className="muted">Prioritize aging flags, watch rule concentration, and keep review decisions moving.</p>
          </div>
          <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void runSweep()} type="button">
            {busyAction === "sweep" ? <Loader2 size={16} /> : <Play size={16} />}
            {busyAction === "sweep" ? "Running..." : "Run sweep"}
          </button>
        </div>
        <ActionFeedback message={message} onDismiss={() => setMessage("")} />
        <div className="grid cols-3">
          <div className="audit-evidence-row">
            <div>
              <strong style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Clock3 size={16} />
                Aging watch
              </strong>
              <p className="muted">{agedFlags.length} flags are older than two days; {highPriorityFlags.length} are seven days or older.</p>
            </div>
            <span className={`badge ${highPriorityFlags.length > 0 ? "danger" : agedFlags.length > 0 ? "warning" : "success"}`}>
              {highPriorityFlags.length > 0 ? "Escalate" : agedFlags.length > 0 ? "Review today" : "Clear"}
            </span>
          </div>
          <div className="audit-evidence-row">
            <div>
              <strong style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <BarChart3 size={16} />
                Rule mix
              </strong>
              <p className="muted">{formatRuleMix(ruleCounts)}</p>
            </div>
            <span className="badge warning">Sweep based</span>
          </div>
          <div className="audit-evidence-row">
            <div>
              <strong style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <ShieldAlert size={16} />
                Audit actions
              </strong>
              <p className="muted">Clear legitimate items or escalate exceptions with an audit-trail entry.</p>
            </div>
            <span className="badge success">Logged</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Fraud Review Queue</h2>
            <p className="muted">
              Run sweeps, review evidence lines, then clear or mark flags escalated in the audit trail.
            </p>
          </div>
        </div>
        <table className="table">
        <thead>
          <tr>
            <th>Rule</th>
            <th>Claim</th>
            <th>Employee</th>
            <th>Age</th>
            <th>Related</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((flag) => (
            <Fragment key={flag.flagId}>
              <tr>
                <td>
                  <strong style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <AlertTriangle size={16} />
                    {flag.ruleLabel}
                  </strong>
                  <br />
                  <span className="muted">{flag.ruleDescription}</span>
                </td>
                <td>{flag.primaryClaimId.slice(0, 8)}</td>
                <td>{flag.employeeName}</td>
                <td>
                  <span className={`badge ${flag.daysOpen >= 7 ? "danger" : flag.daysOpen >= 2 ? "warning" : "success"}`}>
                    {flag.daysOpen} days
                  </span>
                </td>
                <td>{flag.relatedClaimCount}</td>
                <td>
                  <div className="actions">
                    <button className="button secondary" onClick={() => setExpandedFlagId(expandedFlagId === flag.flagId ? null : flag.flagId)} type="button">
                      <Eye size={16} />
                      {expandedFlagId === flag.flagId ? "Hide evidence" : "View evidence"}
                    </button>
                    <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void review(flag.flagId, "Cleared")} type="button">
                      {busyAction === `Cleared:${flag.flagId}` ? <Loader2 size={16} /> : <CheckCircle2 size={16} />}
                      {busyAction === `Cleared:${flag.flagId}` ? "Clearing..." : "Clear"}
                    </button>
                    <button className="button" disabled={Boolean(busyAction)} onClick={() => void review(flag.flagId, "Escalated")} type="button">
                      {busyAction === `Escalated:${flag.flagId}` ? <Loader2 size={16} /> : <ShieldAlert size={16} />}
                      {busyAction === `Escalated:${flag.flagId}` ? "Escalating..." : "Escalate"}
                    </button>
                    <span className="muted">Marks for management review</span>
                  </div>
                </td>
              </tr>
              {expandedFlagId === flag.flagId ? (
                <tr>
                  <td colSpan={6}>
                    <div className="receipt-review">
                      {flag.flaggedLineItems.map((line) => (
                        <div className="audit-evidence-row" key={line.lineItemId}>
                          <div>
                            <strong>{line.description}</strong>
                            <br />
                            <span className="muted">
                              {line.transactionDate} · {expenseTagLabel(line.expenseTag)}
                            </span>
                          </div>
                          <div>
                            <strong>Rs {line.amount.toLocaleString("en-IN")}</strong>
                            <br />
                            <span className="muted">
                              Claim {line.claimId.slice(0, 8)}
                              {line.clientInvoiceNumber ? ` · Invoice ${line.clientInvoiceNumber}` : ""}
                            </span>
                          </div>
                          <span className={`badge ${line.missingReceiptFlag ? "warning" : "success"}`}>
                            {line.missingReceiptFlag ? "Missing receipt" : "Receipt attached"}
                          </span>
                        </div>
                      ))}
                      {flag.flaggedLineItems.length === 0 ? <span className="muted">No line detail available.</span> : null}
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
          {isLoading ? (
            <tr><td colSpan={6}><span className="loading-inline"><Loader2 size={16} />Loading fraud flags...</span></td></tr>
          ) : null}
          {!isLoading && flags.length === 0 ? (
            <tr>
              <td colSpan={6}>No open fraud flags.</td>
            </tr>
          ) : null}
        </tbody>
        </table>
      </section>
    </div>
  );
}

function formatRuleMix(ruleCounts: Record<string, number>) {
  const entries = Object.entries(ruleCounts);
  if (entries.length === 0) return "No active rule clusters right now.";
  return entries.map(([rule, count]) => `${rule}: ${count}`).join(" · ");
}
