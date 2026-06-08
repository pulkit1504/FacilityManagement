"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  Filter,
  Loader2,
  Play,
  Search,
  ShieldAlert
} from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { expenseTagLabel } from "@/shared/expense-tags";
import { MetricCard } from "@/components/ui/metric-card";
import { getProblemMessage } from "@/components/ui/problem-message";

type FraudFlagItem = {
  flagId: string;
  primaryClaimId: string;
  relatedClaimIds: string[];
  ruleName: "DuplicateVoucher" | "ThresholdSplit" | "WeekendOutlier";
  ruleLabel: string;
  ruleDescription: string;
  relatedClaimCount: number;
  daysOpen: number;
  ticketId: string;
  employeeName: string;
  claimStatus: string;
  statusLabel: string;
  pendingLocation: string;
  siteName: string | null;
  totalAmount: number;
  flaggedLineItems: Array<{
    claimId: string;
    lineItemId: string;
    description: string;
    amount: number;
    transactionDate: string;
    expenseTag: string;
    clientInvoiceNumber: string | null;
    vendorInvoiceNumber: string | null;
    missingReceiptFlag: boolean;
  }>;
};

type PriorityFilter = "All" | "Critical" | "High" | "Medium";

export function FraudReview() {
  const [flags, setFlags] = useState<FraudFlagItem[]>([]);
  const [expandedFlagId, setExpandedFlagId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [ruleFilter, setRuleFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");

  const enrichedFlags = useMemo(() => flags.map((flag) => enrichFlag(flag)), [flags]);
  const filteredFlags = useMemo(
    () =>
      enrichedFlags.filter((flag) => {
        const searchText = [
          flag.ticketId,
          flag.primaryClaimId,
          flag.employeeName,
          flag.siteName,
          flag.ruleLabel,
          flag.statusLabel,
          flag.pendingLocation,
          ...flag.flaggedLineItems.flatMap((line) => [
            line.description,
            line.clientInvoiceNumber,
            line.vendorInvoiceNumber,
            line.expenseTag
          ])
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          (ruleFilter === "All" || flag.ruleName === ruleFilter) &&
          (priorityFilter === "All" || flag.priority === priorityFilter) &&
          (statusFilter === "All" || flag.claimStatus === statusFilter) &&
          (!query.trim() || searchText.includes(query.trim().toLowerCase()))
        );
      }),
    [enrichedFlags, priorityFilter, query, ruleFilter, statusFilter]
  );

  const criticalFlags = enrichedFlags.filter((flag) => flag.priority === "Critical");
  const highRiskFlags = enrichedFlags.filter((flag) => flag.priority === "Critical" || flag.priority === "High");
  const agedFlags = enrichedFlags.filter((flag) => flag.daysOpen >= 3);
  const evidenceLineCount = enrichedFlags.reduce((sum, flag) => sum + flag.flaggedLineItems.length, 0);
  const missingReceiptCount = enrichedFlags.reduce(
    (sum, flag) => sum + flag.flaggedLineItems.filter((line) => line.missingReceiptFlag).length,
    0
  );
  const totalExposure = enrichedFlags.reduce((sum, flag) => sum + flag.totalAmount, 0);
  const ruleOptions = Array.from(new Set(enrichedFlags.map((flag) => flag.ruleName)));
  const statusOptions = Array.from(new Set(enrichedFlags.map((flag) => flag.claimStatus)));
  const ruleCounts = enrichedFlags.reduce<Record<string, number>>((acc, flag) => {
    acc[flag.ruleLabel] = (acc[flag.ruleLabel] ?? 0) + 1;
    return acc;
  }, {});
  const agingBuckets = {
    fresh: enrichedFlags.filter((flag) => flag.daysOpen <= 2).length,
    attention: enrichedFlags.filter((flag) => flag.daysOpen >= 3 && flag.daysOpen <= 7).length,
    overdue: enrichedFlags.filter((flag) => flag.daysOpen > 7).length
  };

  async function load() {
    try {
      setIsLoading(true);
      const response = await fetch("/api/v1/fraud/flags?status=Open", { cache: "no-store" });
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
    setMessage(decision === "Cleared" ? "Clearing audit flag..." : "Escalating audit flag...");
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
      setMessage("Could not update the audit flag. Check your connection and try again.");
    } finally {
      setBusyAction(null);
    }
  }

  function exportCsv() {
    const csv = [
      [
        "Ticket",
        "Claim",
        "Claimant",
        "Site",
        "Rule",
        "Risk score",
        "Priority",
        "Days open",
        "Status",
        "Pending location",
        "Amount"
      ],
      ...filteredFlags.map((flag) => [
        flag.ticketId,
        flag.primaryClaimId,
        flag.employeeName,
        flag.siteName ?? "",
        flag.ruleLabel,
        String(flag.riskScore),
        flag.priority,
        String(flag.daysOpen),
        flag.statusLabel,
        flag.pendingLocation,
        String(flag.totalAmount)
      ])
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audit-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid cols-3">
        <MetricCard label="Open risk flags" value={String(enrichedFlags.length)} tone={enrichedFlags.length > 0 ? "warning" : "success"} />
        <MetricCard label="High-risk claims" value={String(highRiskFlags.length)} tone={highRiskFlags.length > 0 ? "danger" : "success"} />
        <MetricCard label="Exposure under audit" value={formatCurrency(totalExposure)} tone={totalExposure > 0 ? "warning" : "success"} />
      </div>
      <div className="grid cols-3">
        <MetricCard label="Aging exceptions" value={String(agedFlags.length)} tone={agedFlags.length > 0 ? "warning" : "success"} />
        <MetricCard label="Pending audit actions" value={String(filteredFlags.length)} tone={filteredFlags.length > 0 ? "warning" : "success"} />
        <MetricCard label="Evidence lines" value={String(evidenceLineCount)} tone={missingReceiptCount > 0 ? "danger" : evidenceLineCount > 0 ? "warning" : "success"} />
      </div>

      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Audit Command Center</h2>
            <p className="muted">Prioritize risk, review exceptions, and close audit actions from one queue.</p>
          </div>
          <div className="actions">
            <button className="button secondary" disabled={filteredFlags.length === 0} onClick={exportCsv} type="button">
              <Download size={16} />
              Export CSV
            </button>
            <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void runSweep()} type="button">
              {busyAction === "sweep" ? <Loader2 size={16} /> : <Play size={16} />}
              {busyAction === "sweep" ? "Running..." : "Run sweep"}
            </button>
          </div>
        </div>
        <ActionFeedback message={message} onDismiss={() => setMessage("")} />

        <div className="grid cols-3">
          <DashboardTile
            icon={<Clock3 size={16} />}
            label="Aging buckets"
            text={`0-2 days: ${agingBuckets.fresh} | 3-7 days: ${agingBuckets.attention} | 8+ days: ${agingBuckets.overdue}`}
            tone={agingBuckets.overdue > 0 ? "danger" : agingBuckets.attention > 0 ? "warning" : "success"}
          />
          <DashboardTile
            icon={<BarChart3 size={16} />}
            label="Exception mix"
            text={formatRuleMix(ruleCounts)}
            tone={criticalFlags.length > 0 ? "danger" : enrichedFlags.length > 0 ? "warning" : "success"}
          />
          <DashboardTile
            icon={<ShieldAlert size={16} />}
            label="Action policy"
            text="Clear legitimate claims, escalate high-risk exceptions, and export evidence for review packs."
            tone={highRiskFlags.length > 0 ? "danger" : "success"}
          />
        </div>
      </section>

      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Audit Filters</h2>
            <p className="muted">Narrow by rule, risk priority, claim status, claimant, invoice, or site.</p>
          </div>
          <span className="badge warning">{filteredFlags.length} shown</span>
        </div>
        <div className="audit-filter-grid">
          <label>
            <span className="muted">Search</span>
            <span className="input-with-icon">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Claim, claimant, invoice, site" />
            </span>
          </label>
          <label>
            <span className="muted">Exception type</span>
            <select value={ruleFilter} onChange={(event) => setRuleFilter(event.target.value)}>
              <option value="All">All exception types</option>
              {ruleOptions.map((rule) => (
                <option key={rule} value={rule}>{ruleLabel(rule)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">Risk priority</span>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}>
              <option value="All">All priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
            </select>
          </label>
          <label>
            <span className="muted">Claim status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="All">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Exception Queue</h2>
            <p className="muted">Every row includes risk score, current status location, and drill-down evidence.</p>
          </div>
          <span className="badge success">
            <Filter size={14} />
            Live filters
          </span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Claim</th>
              <th>Claimant</th>
              <th>Status</th>
              <th>Exception</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredFlags.map((flag) => (
              <Fragment key={flag.flagId}>
                <tr>
                  <td>
                    <strong>{flag.riskScore}</strong>
                    <br />
                    <span className={`badge ${priorityTone(flag.priority)}`}>{flag.priority}</span>
                  </td>
                  <td>
                    <strong>{flag.ticketId}</strong>
                    <br />
                    <span className="muted">{formatCurrency(flag.totalAmount)} | {flag.siteName ?? "No site"}</span>
                  </td>
                  <td>
                    {flag.employeeName}
                    <br />
                    <span className="muted">{flag.daysOpen} days open</span>
                  </td>
                  <td>
                    <span className="badge warning">{flag.statusLabel}</span>
                    <br />
                    <span className="muted">{flag.pendingLocation}</span>
                  </td>
                  <td>
                    <strong style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <AlertTriangle size={16} />
                      {flag.ruleLabel}
                    </strong>
                    <br />
                    <span className="muted">{flag.ruleDescription}</span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="button secondary" onClick={() => setExpandedFlagId(expandedFlagId === flag.flagId ? null : flag.flagId)} type="button">
                        <Eye size={16} />
                        {expandedFlagId === flag.flagId ? "Hide" : "Evidence"}
                      </button>
                      <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void review(flag.flagId, "Cleared")} type="button">
                        {busyAction === `Cleared:${flag.flagId}` ? <Loader2 size={16} /> : <CheckCircle2 size={16} />}
                        Clear
                      </button>
                      <button className="button" disabled={Boolean(busyAction)} onClick={() => void review(flag.flagId, "Escalated")} type="button">
                        {busyAction === `Escalated:${flag.flagId}` ? <Loader2 size={16} /> : <ShieldAlert size={16} />}
                        Escalate
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedFlagId === flag.flagId ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="grid" style={{ gap: 12 }}>
                        <div className="audit-evidence-row">
                          <div>
                            <strong>Why flagged?</strong>
                            <p className="muted">{flag.ruleDescription}</p>
                          </div>
                          <div>
                            <strong>{flag.relatedClaimCount + 1} claim scope</strong>
                            <p className="muted">Primary plus related claim evidence is grouped here.</p>
                          </div>
                          <span className={`badge ${priorityTone(flag.priority)}`}>{flag.priority}</span>
                        </div>
                        {flag.flaggedLineItems.map((line) => (
                          <div className="audit-evidence-row" key={line.lineItemId}>
                            <div>
                              <strong>{line.description}</strong>
                              <br />
                              <span className="muted">
                                {line.transactionDate} | {expenseTagLabel(line.expenseTag)}
                              </span>
                            </div>
                            <div>
                              <strong>{formatCurrency(line.amount)}</strong>
                              <br />
                              <span className="muted">{invoiceReferenceLabel(line.clientInvoiceNumber, line.vendorInvoiceNumber)}</span>
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
              <tr><td colSpan={6}><span className="loading-inline"><Loader2 size={16} />Loading audit dashboard...</span></td></tr>
            ) : null}
            {!isLoading && filteredFlags.length === 0 ? (
              <tr>
                <td colSpan={6}>No audit exceptions match the current filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function DashboardTile({ icon, label, text, tone }: { icon: ReactNode; label: string; text: string; tone: "success" | "warning" | "danger" }) {
  return (
    <div className="audit-evidence-row">
      <div>
        <strong style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {icon}
          {label}
        </strong>
        <p className="muted">{text}</p>
      </div>
      <span className={`badge ${tone}`}>{tone === "danger" ? "Critical" : tone === "warning" ? "Watch" : "Clear"}</span>
    </div>
  );
}

function enrichFlag(flag: FraudFlagItem) {
  const missingReceipts = flag.flaggedLineItems.filter((line) => line.missingReceiptFlag).length;
  const baseByRule: Record<FraudFlagItem["ruleName"], number> = {
    DuplicateVoucher: 55,
    ThresholdSplit: 45,
    WeekendOutlier: 35
  };
  const riskScore = Math.min(
    100,
    baseByRule[flag.ruleName] +
      Math.min(flag.daysOpen * 4, 28) +
      Math.min(flag.relatedClaimCount * 6, 12) +
      Math.min(missingReceipts * 5, 10)
  );

  return {
    ...flag,
    riskScore,
    priority: riskScore >= 80 ? "Critical" as const : riskScore >= 60 ? "High" as const : "Medium" as const
  };
}

function priorityTone(priority: "Critical" | "High" | "Medium") {
  if (priority === "Critical") return "danger";
  if (priority === "High") return "warning";
  return "success";
}

function formatRuleMix(ruleCounts: Record<string, number>) {
  const entries = Object.entries(ruleCounts);
  if (entries.length === 0) return "No active rule clusters right now.";
  return entries.map(([rule, count]) => `${rule}: ${count}`).join(" | ");
}

function ruleLabel(rule: string) {
  const labels: Record<string, string> = {
    DuplicateVoucher: "Duplicate Voucher Suspected",
    ThresholdSplit: "Threshold Split Suspected",
    WeekendOutlier: "Non-Operational Day"
  };
  return labels[rule] ?? rule;
}

function invoiceReferenceLabel(clientInvoiceNumber: string | null, vendorInvoiceNumber: string | null) {
  const references = [
    clientInvoiceNumber ? `Client ${clientInvoiceNumber}` : null,
    vendorInvoiceNumber ? `Vendor ${vendorInvoiceNumber}` : null
  ].filter(Boolean);
  return references.length > 0 ? references.join(" | ") : "No invoice reference";
}

function formatCurrency(value: number) {
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
