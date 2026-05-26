"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Play, ShieldAlert } from "lucide-react";

type FraudFlagItem = {
  flagId: string;
  primaryClaimId: string;
  ruleName: "DuplicateVoucher" | "ThresholdSplit" | "WeekendOutlier";
  ruleLabel: string;
  ruleDescription: string;
  relatedClaimCount: number;
  daysOpen: number;
  employeeName: string;
};

export function FraudReview() {
  const [flags, setFlags] = useState<FraudFlagItem[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/v1/fraud/flags?status=Open");
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.detail ?? "Could not load fraud flags.");
      return;
    }
    setFlags(data.flags ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function runSweep() {
    const response = await fetch("/api/v1/fraud/sweep", { method: "POST" });
    const data = await response.json();
    setMessage(
      response.ok
        ? `Sweep complete. ${data.createdFlagsCount} new flags from ${data.evaluatedClaims} claims.`
        : data.detail ?? "Sweep failed."
    );
    await load();
  }

  async function review(flagId: string, decision: "Cleared" | "Escalated") {
    const response = await fetch(`/api/v1/fraud/flags/${flagId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        remarks: decision === "Cleared" ? "Reviewed and found legitimate." : "Escalated for management review."
      })
    });
    const data = await response.json();
    setMessage(data.message ?? data.detail ?? "Flag updated.");
    await load();
  }

  return (
    <section className="panel">
      <div className="topbar" style={{ marginBottom: 12 }}>
        <div>
          <h2>Fraud Review Queue</h2>
          <p className="muted">Run sweeps and resolve suspicious claims with an audit trail.</p>
        </div>
        <button className="button secondary" onClick={() => void runSweep()} type="button">
          <Play size={16} />
          Run sweep
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
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
            <tr key={flag.flagId}>
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
                  <button className="button secondary" onClick={() => void review(flag.flagId, "Cleared")} type="button">
                    <CheckCircle2 size={16} />
                    Clear
                  </button>
                  <button className="button" onClick={() => void review(flag.flagId, "Escalated")} type="button">
                    <ShieldAlert size={16} />
                    Escalate
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {flags.length === 0 ? (
            <tr>
              <td colSpan={6}>No open fraud flags.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
