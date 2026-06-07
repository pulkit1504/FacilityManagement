"use client";

import { Fragment, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Loader2, Play, ShieldAlert } from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { expenseTagLabel } from "@/shared/expense-tags";
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
    <section className="panel">
      <div className="topbar" style={{ marginBottom: 12 }}>
        <div>
          <h2>Fraud Review Queue</h2>
          <p className="muted">
            Run sweeps, review evidence lines, then clear or mark flags escalated in the audit trail.
          </p>
        </div>
        <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void runSweep()} type="button">
          {busyAction === "sweep" ? <Loader2 size={16} /> : <Play size={16} />}
          {busyAction === "sweep" ? "Running..." : "Run sweep"}
        </button>
      </div>
      <ActionFeedback message={message} onDismiss={() => setMessage("")} />
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
  );
}
