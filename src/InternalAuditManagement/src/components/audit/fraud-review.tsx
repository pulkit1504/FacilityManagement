"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  FileText,
  Filter,
  Loader2,
  Play,
  Search,
  ShieldAlert,
  UserCheck
} from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { expenseTagLabel } from "@/shared/expense-tags";
import { MetricCard } from "@/components/ui/metric-card";
import { getProblemMessage } from "@/components/ui/problem-message";

type FraudFlagItem = {
  flagId: string;
  primaryClaimId: string;
  relatedClaimIds: string[];
  ruleName: string;
  ruleLabel: string;
  ruleDescription: string;
  relatedClaimCount: number;
  daysOpen: number;
  ticketId: string;
  employeeName: string;
  claimKind: string;
  submissionMode: string;
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
    vendorName: string | null;
    vendorInvoiceNumber: string | null;
    missingReceiptFlag: boolean;
    receiptAttachmentCount?: number;
  }>;
  approvalTrail?: Array<{
    role: string;
    decision: string;
    decidedAt: string | null;
    remarks: string | null;
  }>;
};

type AuditClaimItem = {
  claimId: string;
  ticketId: string;
  claimKind: string;
  submittedBy: string;
  siteName: string | null;
  totalAmount: number;
  finalPayableAmount: number;
  lineItemCount: number;
  missingReceiptCount: number;
  daysPending: number;
  urgencyLevel: string;
  receiptConfirmedAt: string | null;
  auditorVoucherReceivedAt: string | null;
  pendingBillingItemCount: number;
};

type AuditReceiptDetail = {
  ticketId: string;
  lineItems: Array<{
    lineItemId: string;
    description: string;
    amount: number;
    expenseTag: string;
    clientInvoiceNumber: string | null;
    vendorName: string | null;
    vendorInvoiceNumber: string | null;
    missingReceiptFlag: boolean;
    attachments: Array<{
      attachmentId: string;
      originalFileName: string;
      fileSizeBytes: number;
      uploadedAt: string;
    }>;
  }>;
};

type PriorityFilter = "All" | "Critical" | "High" | "Medium";
type AuditAction = "Cleared" | "Escalated" | "Clarification" | "Suspicious";
type SummaryFilter = "All" | "HighRisk" | "Aging" | "PendingActions" | "Exposure" | "Evidence";

const ownerOptions = ["Unassigned", "Finance", "Internal Audit", "MD Office"];
const summaryLabels: Record<SummaryFilter, string> = {
  All: "Total open flags",
  HighRisk: "High-risk claims",
  Aging: "Aging exceptions",
  PendingActions: "Pending audit actions",
  Exposure: "Exposure under audit",
  Evidence: "Evidence lines"
};

export function FraudReview() {
  const auditorQueueRef = useRef<HTMLElement | null>(null);
  const exceptionQueueRef = useRef<HTMLElement | null>(null);
  const [flags, setFlags] = useState<FraudFlagItem[]>([]);
  const [auditItems, setAuditItems] = useState<AuditClaimItem[]>([]);
  const [auditReceiptDetails, setAuditReceiptDetails] = useState<Record<string, AuditReceiptDetail>>({});
  const [expandedAuditClaimId, setExpandedAuditClaimId] = useState<string | null>(null);
  const [expandedFlagId, setExpandedFlagId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [ruleFilter, setRuleFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [employeeFilter, setEmployeeFilter] = useState("All");
  const [siteFilter, setSiteFilter] = useState("All");
  const [claimTypeFilter, setClaimTypeFilter] = useState("All");
  const [expenseTagFilter, setExpenseTagFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");
  const [approverFilter, setApproverFilter] = useState("All");
  const [vendorFilter, setVendorFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("All");

  const enrichedFlags = useMemo(() => flags.map((flag) => enrichFlag(flag)), [flags]);
  const filteredFlags = useMemo(
    () =>
      enrichedFlags.filter((flag) => {
        const vendors = lineValues(flag, (line) => line.vendorName);
        const tags = lineValues(flag, (line) => line.expenseTag);
        const months = lineValues(flag, (line) => line.transactionDate.slice(0, 7));
        const approvers = lineValues(flag, () => flag.approvalTrail?.map((step) => step.role).join(" "));
        const searchText = [
          flag.ticketId,
          flag.primaryClaimId,
          flag.employeeName,
          flag.siteName,
          flag.claimKind,
          flag.submissionMode,
          flag.ruleLabel,
          flag.statusLabel,
          flag.pendingLocation,
          flag.exceptionType,
          owners[flag.flagId],
          ...flag.riskReasons,
          ...flag.flaggedLineItems.flatMap((line) => [
            line.description,
            line.clientInvoiceNumber,
            line.vendorInvoiceNumber,
            line.vendorName,
            line.expenseTag
          ])
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          matchesSummaryFilter(flag, summaryFilter) &&
          (ruleFilter === "All" || flag.exceptionType === ruleFilter || flag.ruleName === ruleFilter) &&
          (priorityFilter === "All" || flag.priority === priorityFilter) &&
          (statusFilter === "All" || flag.claimStatus === statusFilter) &&
          (employeeFilter === "All" || flag.employeeName === employeeFilter) &&
          (siteFilter === "All" || (flag.siteName ?? "No site") === siteFilter) &&
          (claimTypeFilter === "All" || flag.claimKind === claimTypeFilter || flag.submissionMode === claimTypeFilter) &&
          (expenseTagFilter === "All" || tags.includes(expenseTagFilter)) &&
          (monthFilter === "All" || months.includes(monthFilter)) &&
          (approverFilter === "All" || approvers.some((role) => role.includes(approverFilter))) &&
          (vendorFilter === "All" || vendors.includes(vendorFilter)) &&
          (!query.trim() || searchText.includes(query.trim().toLowerCase()))
        );
      }),
    [
      approverFilter,
      claimTypeFilter,
      employeeFilter,
      enrichedFlags,
      expenseTagFilter,
      monthFilter,
      owners,
      priorityFilter,
      query,
      ruleFilter,
      siteFilter,
      summaryFilter,
      statusFilter,
      vendorFilter
    ]
  );

  const highRiskFlags = enrichedFlags.filter((flag) => flag.priority === "Critical" || flag.priority === "High");
  const agedFlags = enrichedFlags.filter((flag) => flag.daysOpen >= 3);
  const overdueFlags = enrichedFlags.filter((flag) => flag.daysOpen > 7);
  const evidenceLineCount = enrichedFlags.reduce((sum, flag) => sum + flag.flaggedLineItems.length, 0);
  const missingReceiptCount = enrichedFlags.reduce(
    (sum, flag) => sum + flag.flaggedLineItems.filter((line) => line.missingReceiptFlag).length,
    0
  );
  const totalExposure = enrichedFlags.reduce((sum, flag) => sum + flag.totalAmount, 0);
  const correctionFlags = enrichedFlags.filter((flag) => flag.claimStatus === "Rejected");
  const repeatCorrections = correctionFlags.filter((flag) => (flag.approvalTrail ?? []).filter((step) => step.decision === "Rejected").length > 1);
  const agingBuckets = [
    { label: "0-2 days", count: enrichedFlags.filter((flag) => flag.daysOpen <= 2).length, priority: "Normal" },
    { label: "3-7 days", count: enrichedFlags.filter((flag) => flag.daysOpen >= 3 && flag.daysOpen <= 7).length, priority: "Escalate if unowned" },
    { label: "8+ days", count: overdueFlags.length, priority: "Immediate escalation" }
  ];
  const statusBuckets = countBy(enrichedFlags.map((flag) => flag.pendingLocation));
  const ownerBuckets = countBy(enrichedFlags.map((flag) => owners[flag.flagId] ?? "Unassigned"));

  const filterOptions = {
    rules: unique(enrichedFlags.flatMap((flag) => [flag.exceptionType, flag.ruleName])),
    statuses: unique(enrichedFlags.map((flag) => flag.claimStatus)),
    employees: unique(enrichedFlags.map((flag) => flag.employeeName)),
    sites: unique(enrichedFlags.map((flag) => flag.siteName ?? "No site")),
    claimTypes: unique(enrichedFlags.flatMap((flag) => [flag.claimKind, flag.submissionMode])),
    expenseTags: unique(enrichedFlags.flatMap((flag) => flag.flaggedLineItems.map((line) => line.expenseTag))),
    months: unique(enrichedFlags.flatMap((flag) => flag.flaggedLineItems.map((line) => line.transactionDate.slice(0, 7)))),
    approvers: unique(enrichedFlags.flatMap((flag) => flag.approvalTrail?.map((step) => step.role) ?? [])),
    vendors: unique(enrichedFlags.flatMap((flag) => lineValues(flag, (line) => line.vendorName)))
  };

  async function load() {
    try {
      setIsLoading(true);
      const [flagsResponse, queueResponse] = await Promise.all([
        fetch("/api/v1/fraud/flags?status=Open", { cache: "no-store" }),
        fetch("/api/v1/audit/queue", { cache: "no-store" })
      ]);
      const [flagsData, queueData] = await Promise.all([flagsResponse.json(), queueResponse.json()]);
      if (!flagsResponse.ok) {
        setMessage(getProblemMessage(flagsData, "Could not load fraud flags."));
        return;
      }
      setFlags(flagsData.flags ?? []);
      setAuditItems(queueResponse.ok ? queueData.items ?? [] : []);
      if (!queueResponse.ok) {
        setMessage(getProblemMessage(queueData, "Audit claim queue could not be loaded."));
      }
    } catch {
      setMessage("Could not load fraud flags. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function auditClaim(claimId: string, action: "approve" | "reject" | "request-information") {
    const labels = {
      approve: "Approve",
      reject: "Reject",
      "request-information": "Mark pending information"
    };
    const defaultRemark = action === "approve" ? "Audit evidence reviewed and approved for payment release." : "";
    const remarks = window.prompt(`${labels[action]} claim - enter audit remarks`, defaultRemark);
    if (!remarks) return;

    setBusyAction(`${action}:${claimId}`);
    setMessage(`${labels[action]} audit action in progress...`);
    try {
      const response = await fetch(`/api/v1/audit/claims/${claimId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getProblemMessage(data, "Audit action failed."));
      setMessage(data.message ?? "Audit action recorded.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Audit action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function receiveAuditVouchers(claimId: string) {
    setBusyAction(`receive-vouchers:${claimId}`);
    setMessage("Marking voucher pack as received...");
    try {
      const response = await fetch(`/api/v1/audit/claims/${claimId}/receive-vouchers`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(getProblemMessage(data, "Could not mark voucher pack as received."));
      setAuditItems((current) => current.map((item) => (
        item.claimId === claimId ? { ...item, auditorVoucherReceivedAt: data.receivedAt } : item
      )));
      setMessage(data.message ?? "Voucher pack marked as received.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark voucher pack as received.");
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleAuditReceipts(claimId: string) {
    if (expandedAuditClaimId === claimId) {
      setExpandedAuditClaimId(null);
      return;
    }

    setExpandedAuditClaimId(claimId);
    if (auditReceiptDetails[claimId]) return;

    setBusyAction(`audit-receipts:${claimId}`);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(getProblemMessage(data, "Could not load auditor receipt evidence."));
      setAuditReceiptDetails((current) => ({ ...current, [claimId]: data }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load auditor receipt evidence.");
    } finally {
      setBusyAction(null);
    }
  }

  async function openAuditReceipt(claimId: string, lineItemId: string, attachmentId: string) {
    setBusyAction(`audit-download:${attachmentId}`);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/line-items/${lineItemId}/attachments/${attachmentId}/download`);
      const data = await response.json();
      if (!response.ok) throw new Error(getProblemMessage(data, "Could not open receipt."));
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open receipt.");
    } finally {
      setBusyAction(null);
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

  async function review(flagId: string, action: AuditAction) {
    const decision = action === "Cleared" ? "Cleared" : "Escalated";
    const remarks = remarksForAction(action, owners[flagId]);
    setBusyAction(`${action}:${flagId}`);
    setMessage(action === "Cleared" ? "Clearing audit flag..." : "Recording audit action...");
    try {
      const response = await fetch(`/api/v1/fraud/flags/${flagId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, remarks })
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

  async function assignOwner(flagId: string) {
    const owner = owners[flagId] ?? "Unassigned";
    if (owner === "Unassigned") {
      setMessage("Select an owner before assignment.");
      return;
    }

    setBusyAction(`Assign:${flagId}`);
    setMessage(`Assigning audit owner to ${owner}...`);
    try {
      const response = await fetch(`/api/v1/fraud/flags/${flagId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "Escalated",
          remarks: `Assigned to ${owner} for audit follow-up.`
        })
      });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, "Owner assignment recorded."));
      if (response.ok) await load();
    } catch {
      setMessage("Could not assign audit owner. Check your connection and try again.");
    } finally {
      setBusyAction(null);
    }
  }

  function exportCsv() {
    const csv = buildCsv(filteredFlags, owners);
    downloadText(csv, `audit-review-evidence-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
  }

  function exportPdf() {
    window.print();
  }

  function resetListFilters() {
    setRuleFilter("All");
    setPriorityFilter("All");
    setStatusFilter("All");
    setEmployeeFilter("All");
    setSiteFilter("All");
    setClaimTypeFilter("All");
    setExpenseTagFilter("All");
    setMonthFilter("All");
    setApproverFilter("All");
    setVendorFilter("All");
    setQuery("");
  }

  function openSummaryList(filter: SummaryFilter) {
    resetListFilters();
    setSummaryFilter(filter);
    setMessage(`Showing ${summaryLabels[filter]} list.`);
    window.requestAnimationFrame(() => {
      const target = filter === "PendingActions" && auditItems.length > 0 ? auditorQueueRef.current : exceptionQueueRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="grid audit-dashboard" style={{ gap: 16 }}>
      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Open Risk Summary</h2>
            <p className="muted">Total open flags, high-risk claims, aging exceptions, and pending audit actions.</p>
          </div>
          <div className="actions">
            <button className="button secondary" disabled={filteredFlags.length === 0} onClick={exportCsv} type="button">
              <Download size={16} />
              Export CSV
            </button>
            <button className="button secondary" disabled={filteredFlags.length === 0} onClick={exportPdf} type="button">
              <FileText size={16} />
              Export PDF
            </button>
            <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void runSweep()} type="button">
              {busyAction === "sweep" ? <Loader2 size={16} /> : <Play size={16} />}
              {busyAction === "sweep" ? "Running..." : "Run sweep"}
            </button>
          </div>
        </div>
        <ActionFeedback message={message} onDismiss={() => setMessage("")} />
        <div className="grid cols-3">
          <MetricCard label="Total open flags" value={String(enrichedFlags.length)} tone={enrichedFlags.length > 0 ? "warning" : "success"} active={summaryFilter === "All"} onClick={() => openSummaryList("All")} />
          <MetricCard label="High-risk claims" value={String(highRiskFlags.length)} tone={highRiskFlags.length > 0 ? "danger" : "success"} active={summaryFilter === "HighRisk"} onClick={() => openSummaryList("HighRisk")} />
          <MetricCard label="Aging exceptions" value={String(agedFlags.length)} tone={agedFlags.length > 0 ? "warning" : "success"} active={summaryFilter === "Aging"} onClick={() => openSummaryList("Aging")} />
          <MetricCard label="Pending audit actions" value={String(auditItems.length + filteredFlags.length)} tone={auditItems.length + filteredFlags.length > 0 ? "warning" : "success"} active={summaryFilter === "PendingActions"} onClick={() => openSummaryList("PendingActions")} />
          <MetricCard label="Exposure under audit" value={formatCurrency(totalExposure)} tone={totalExposure > 0 ? "warning" : "success"} active={summaryFilter === "Exposure"} onClick={() => openSummaryList("Exposure")} />
          <MetricCard label="Evidence lines" value={String(evidenceLineCount)} tone={missingReceiptCount > 0 ? "danger" : evidenceLineCount > 0 ? "warning" : "success"} active={summaryFilter === "Evidence"} onClick={() => openSummaryList("Evidence")} />
        </div>
      </section>

      <section className="panel" ref={auditorQueueRef}>
        <div className="section-heading">
          <div>
            <h2>Auditor Receipt Review Queue</h2>
            <p className="muted">Finance-confirmed receipts waiting for audit approval, rejection, or pending-information return.</p>
          </div>
          <span className="badge warning">{auditItems.length} pending</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Claim</th>
              <th>Claimant / site</th>
              <th>Receipt and evidence</th>
              <th>Amount</th>
              <th>Auditor decision</th>
            </tr>
          </thead>
          <tbody>
            {auditItems.map((item) => (
              <Fragment key={item.claimId}>
                <tr>
                  <td>
                    <strong>{item.ticketId}</strong>
                    <br />
                    <span className="muted">{item.claimKind} | {item.daysPending} days pending</span>
                  </td>
                  <td>
                    {item.submittedBy}
                    <br />
                    <span className="muted">{item.siteName ?? "No site linked"}</span>
                  </td>
                  <td>
                    <span className={`badge ${item.missingReceiptCount > 0 ? "warning" : "success"}`}>
                      {item.missingReceiptCount > 0 ? `${item.missingReceiptCount} missing` : "Receipts present"}
                    </span>
                    <br />
                    <span className="muted">{item.lineItemCount} lines | receipt {item.receiptConfirmedAt ? "confirmed" : "not confirmed"}</span>
                    {item.receiptConfirmedAt ? <><br /><span className="muted">Finance: {formatTimestamp(item.receiptConfirmedAt)}</span></> : null}
                  </td>
                  <td>
                    <strong>{formatCurrency(item.finalPayableAmount)}</strong>
                    <br />
                    <span className="muted">{item.pendingBillingItemCount} B2C - Pending Billing</span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void toggleAuditReceipts(item.claimId)} type="button">
                        {busyAction === `audit-receipts:${item.claimId}` ? <Loader2 size={16} /> : <Eye size={16} />}
                        {expandedAuditClaimId === item.claimId ? "Hide receipts" : "View receipts"}
                      </button>
                      {item.claimKind !== "Advance" ? (
                        <button className="button secondary" disabled={Boolean(busyAction) || Boolean(item.auditorVoucherReceivedAt)} onClick={() => void receiveAuditVouchers(item.claimId)} type="button">
                          {busyAction === `receive-vouchers:${item.claimId}` ? <Loader2 size={16} /> : <ClipboardCheck size={16} />}
                          {item.auditorVoucherReceivedAt ? `Received ${formatTimestamp(item.auditorVoucherReceivedAt)}` : "Mark vouchers received"}
                        </button>
                      ) : null}
                      <button className="button" disabled={Boolean(busyAction) || (item.claimKind !== "Advance" && !item.auditorVoucherReceivedAt)} onClick={() => void auditClaim(item.claimId, "approve")} type="button">
                        {busyAction === `approve:${item.claimId}` ? <Loader2 size={16} /> : <CheckCircle2 size={16} />}
                        Approve
                      </button>
                      <button className="button secondary" disabled={Boolean(busyAction) || (item.claimKind !== "Advance" && !item.auditorVoucherReceivedAt)} onClick={() => void auditClaim(item.claimId, "request-information")} type="button">
                        {busyAction === `request-information:${item.claimId}` ? <Loader2 size={16} /> : <FileText size={16} />}
                        Pending information
                      </button>
                      <button className="button danger" disabled={Boolean(busyAction) || (item.claimKind !== "Advance" && !item.auditorVoucherReceivedAt)} onClick={() => void auditClaim(item.claimId, "reject")} type="button">
                        {busyAction === `reject:${item.claimId}` ? <Loader2 size={16} /> : <AlertTriangle size={16} />}
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedAuditClaimId === item.claimId ? (
                  <tr>
                    <td colSpan={5}>
                      <AuditReceiptPanel
                        claimId={item.claimId}
                        detail={auditReceiptDetails[item.claimId]}
                        isLoading={busyAction === `audit-receipts:${item.claimId}`}
                        onOpenReceipt={openAuditReceipt}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {isLoading ? (
              <tr><td colSpan={5}><span className="loading-inline"><Loader2 size={16} />Loading audit queue...</span></td></tr>
            ) : null}
            {!isLoading && auditItems.length === 0 ? (
              <tr><td colSpan={5}>No finance-confirmed receipts are waiting for Auditor review.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Risk Score Per Claim</h2>
            <p className="muted">Scores include duplicate invoices, old or out-of-month dates, weekend claims, split bills, missing receipts, repeated vendor use, manual overrides, and advance-limit signals.</p>
          </div>
        </div>
        <div className="grid cols-3">
          {enrichedFlags.slice(0, 6).map((flag) => (
            <DashboardTile
              key={flag.flagId}
              icon={<BarChart3 size={16} />}
              label={`${flag.ticketId} - ${flag.riskScore}`}
              text={`${flag.priority}: ${flag.riskReasons.join(", ")}`}
              tone={priorityTone(flag.priority)}
            />
          ))}
          {!isLoading && enrichedFlags.length === 0 ? (
            <DashboardTile icon={<BarChart3 size={16} />} label="No active risk scores" text="Run a sweep to refresh duplicate, split, weekend, receipt, vendor, and date checks." tone="success" />
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Aging Buckets</h2>
            <p className="muted">Escalation priority is visible by open age.</p>
          </div>
        </div>
        <div className="grid cols-3">
          {agingBuckets.map((bucket) => (
            <DashboardTile
              key={bucket.label}
              icon={<Clock3 size={16} />}
              label={`${bucket.label}: ${bucket.count}`}
              text={bucket.priority}
              tone={bucket.label === "8+ days" && bucket.count > 0 ? "danger" : bucket.count > 0 ? "warning" : "success"}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Claim Status Tracker</h2>
            <p className="muted">Shows where each flagged claim is pending: claimant, approver, finance, audit, or payment.</p>
          </div>
        </div>
        <div className="grid cols-3">
          {statusBuckets.map((bucket) => (
            <DashboardTile key={bucket.label} icon={<UserCheck size={16} />} label={`${bucket.label}: ${bucket.count}`} text="Current pending location" tone={bucket.label.includes("Audit") ? "warning" : "success"} />
          ))}
          {statusBuckets.length === 0 ? (
            <DashboardTile icon={<UserCheck size={16} />} label="No claims pending audit" text="The tracker will group claimant, approver, finance, audit, and payment locations as flags appear." tone="success" />
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Reopen / Correction Tracking</h2>
            <p className="muted">Returned claims, correction reasons, claimant response age, and repeat corrections.</p>
          </div>
        </div>
        <div className="grid cols-3">
          <MetricCard label="Claims reopened or returned" value={String(correctionFlags.length)} tone={correctionFlags.length > 0 ? "warning" : "success"} />
          <MetricCard label="Repeat corrections" value={String(repeatCorrections.length)} tone={repeatCorrections.length > 0 ? "danger" : "success"} />
          <MetricCard label="Oldest claimant response age" value={`${Math.max(0, ...correctionFlags.map((flag) => flag.daysOpen))} days`} tone={correctionFlags.some((flag) => flag.daysOpen > 7) ? "danger" : correctionFlags.length > 0 ? "warning" : "success"} />
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          {correctionFlags.slice(0, 4).map((flag) => (
            <DashboardTile
              key={flag.flagId}
              icon={<AlertTriangle size={16} />}
              label={`${flag.ticketId} correction`}
              text={correctionReason(flag)}
              tone={flag.daysOpen > 7 ? "danger" : "warning"}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Filters</h2>
            <p className="muted">Employee, department/site, claim type, expense tag, month, approver, vendor, risk type, and status.</p>
          </div>
          <span className="badge warning">{filteredFlags.length} shown</span>
        </div>
        <div className="audit-filter-grid wide">
          <FilterField label="Search" value={query} onChange={setQuery} placeholder="Claim, employee, invoice, vendor" />
          <SelectField label="Employee" value={employeeFilter} options={filterOptions.employees} onChange={setEmployeeFilter} allLabel="All employees" />
          <SelectField label="Department / Site" value={siteFilter} options={filterOptions.sites} onChange={setSiteFilter} allLabel="All sites" />
          <SelectField label="Claim type" value={claimTypeFilter} options={filterOptions.claimTypes} onChange={setClaimTypeFilter} allLabel="All claim types" />
          <SelectField label="Expense tag" value={expenseTagFilter} options={filterOptions.expenseTags} onChange={setExpenseTagFilter} allLabel="All expense tags" />
          <SelectField label="Month" value={monthFilter} options={filterOptions.months} onChange={setMonthFilter} allLabel="All months" />
          <SelectField label="Approver" value={approverFilter} options={filterOptions.approvers} onChange={setApproverFilter} allLabel="All approvers" />
          <SelectField label="Vendor" value={vendorFilter} options={filterOptions.vendors} onChange={setVendorFilter} allLabel="All vendors" />
          <SelectField label="Risk type" value={ruleFilter} options={filterOptions.rules} onChange={setRuleFilter} allLabel="All risk types" />
          <SelectField label="Status" value={statusFilter} options={filterOptions.statuses} onChange={setStatusFilter} allLabel="All statuses" />
          <label>
            <span className="muted">Priority</span>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}>
              <option value="All">All priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel" ref={exceptionQueueRef}>
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Exception Queue</h2>
            <p className="muted">Showing {summaryLabels[summaryFilter]}: {filteredFlags.length} claim exception(s) from the selected Open Risk Summary tab.</p>
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
              <th>Audit action buttons</th>
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
                    <span className="muted">{flag.claimKind} | {flag.daysOpen} days open</span>
                  </td>
                  <td>
                    <span className="badge warning">{flag.statusLabel}</span>
                    <br />
                    <span className="muted">{flag.pendingLocation}</span>
                  </td>
                  <td>
                    <strong style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <AlertTriangle size={16} />
                      {flag.exceptionType}
                    </strong>
                    <br />
                    <span className="muted">{flag.riskReasons.join(", ")}</span>
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
                      <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void review(flag.flagId, "Clarification")} type="button">
                        {busyAction === `Clarification:${flag.flagId}` ? <Loader2 size={16} /> : <FileText size={16} />}
                        Request clarification
                      </button>
                      <button className="button danger" disabled={Boolean(busyAction)} onClick={() => void review(flag.flagId, "Suspicious")} type="button">
                        {busyAction === `Suspicious:${flag.flagId}` ? <Loader2 size={16} /> : <ShieldAlert size={16} />}
                        Mark suspicious
                      </button>
                      <button className="button" disabled={Boolean(busyAction)} onClick={() => void review(flag.flagId, "Escalated")} type="button">
                        {busyAction === `Escalated:${flag.flagId}` ? <Loader2 size={16} /> : <ShieldAlert size={16} />}
                        Escalate
                      </button>
                      <select
                        aria-label={`Owner for ${flag.ticketId}`}
                        value={owners[flag.flagId] ?? "Unassigned"}
                        onChange={(event) => setOwners((current) => ({ ...current, [flag.flagId]: event.target.value }))}
                      >
                        {ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
                      </select>
                      <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void assignOwner(flag.flagId)} type="button">
                        {busyAction === `Assign:${flag.flagId}` ? <Loader2 size={16} /> : <UserCheck size={16} />}
                        Assign owner
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedFlagId === flag.flagId ? (
                  <tr>
                    <td colSpan={6}>
                      <EvidencePanel flag={flag} owner={owners[flag.flagId] ?? "Unassigned"} />
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

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Audit Owner Queue</h2>
            <p className="muted">Local assignment view for ownership before clearing, clarification, suspicious marking, or escalation.</p>
          </div>
        </div>
        <div className="grid cols-3">
          {ownerBuckets.map((bucket) => (
            <DashboardTile key={bucket.label} icon={<UserCheck size={16} />} label={`${bucket.label}: ${bucket.count}`} text="Audit action owner" tone={bucket.label === "Unassigned" && bucket.count > 0 ? "warning" : "success"} />
          ))}
        </div>
      </section>
    </div>
  );
}

function EvidencePanel({ flag, owner }: { flag: ReturnType<typeof enrichFlag>; owner: string }) {
  return (
    <div className="grid" style={{ gap: 12 }}>
      <h3>Drill-down Evidence</h3>
      <div className="audit-evidence-row">
        <div>
          <strong>Claim and employee</strong>
          <p className="muted">{flag.ticketId} | {flag.employeeName} | {flag.siteName ?? "No site"}</p>
        </div>
        <div>
          <strong>Amount and status</strong>
          <p className="muted">{formatCurrency(flag.totalAmount)} | {flag.pendingLocation}</p>
        </div>
        <span className={`badge ${priorityTone(flag.priority)}`}>{flag.priority}</span>
      </div>
      <div className="audit-evidence-row">
        <div>
          <strong>Why flagged?</strong>
          <p className="muted">{flag.ruleDescription}</p>
        </div>
        <div>
          <strong>Assigned owner</strong>
          <p className="muted">{owner}</p>
        </div>
        <span className="badge warning">{flag.relatedClaimCount + 1} claim scope</span>
      </div>
      {flag.flaggedLineItems.map((line) => (
        <div className="audit-evidence-row" key={line.lineItemId}>
          <div>
            <strong>{line.description}</strong>
            <br />
            <span className="muted">
              {line.transactionDate} | {expenseTagLabel(line.expenseTag)} | {line.vendorName ?? "No vendor"}
            </span>
          </div>
          <div>
            <strong>{formatCurrency(line.amount)}</strong>
            <br />
            <span className="muted">{invoiceReferenceLabel(line.clientInvoiceNumber, line.vendorInvoiceNumber)}</span>
          </div>
          <span className={`badge ${line.missingReceiptFlag ? "warning" : "success"}`}>
            {line.missingReceiptFlag ? "Missing receipt" : `${line.receiptAttachmentCount ?? 0} receipt attachments`}
          </span>
        </div>
      ))}
      <div>
        <strong>Approval trail</strong>
        <div className="grid" style={{ gap: 8, marginTop: 8 }}>
          {(flag.approvalTrail ?? []).map((step, index) => (
            <div className="audit-evidence-row" key={`${step.role}-${index}`}>
              <div>
                <strong>{step.role}</strong>
                <p className="muted">{step.decision} {step.decidedAt ? `on ${formatTimestamp(step.decidedAt)}` : ""}</p>
              </div>
              <div>
                <strong>Remarks</strong>
                <p className="muted">{step.remarks ?? "No remarks"}</p>
              </div>
              <span className={`badge ${step.decision === "Rejected" ? "danger" : step.decision === "Pending" ? "warning" : "success"}`}>{step.decision}</span>
            </div>
          ))}
          {(flag.approvalTrail ?? []).length === 0 ? <span className="muted">No approval trail available for this claim yet.</span> : null}
        </div>
      </div>
    </div>
  );
}

function AuditReceiptPanel({
  claimId,
  detail,
  isLoading,
  onOpenReceipt
}: {
  claimId: string;
  detail: AuditReceiptDetail | undefined;
  isLoading: boolean;
  onOpenReceipt: (claimId: string, lineItemId: string, attachmentId: string) => Promise<void>;
}) {
  if (isLoading || !detail) {
    return <span className="loading-inline"><Loader2 size={16} />Loading receipt evidence...</span>;
  }

  return (
    <div className="grid" style={{ gap: 12 }}>
      <h3>Receipt Evidence</h3>
      {detail.lineItems.map((line) => (
        <div className="audit-evidence-row" key={line.lineItemId}>
          <div>
            <strong>{line.description}</strong>
            <p className="muted">
              {expenseTagLabel(line.expenseTag)} | {line.vendorName ?? "No vendor"} | {invoiceReferenceLabel(line.clientInvoiceNumber, line.vendorInvoiceNumber)}
            </p>
          </div>
          <div>
            <strong>{formatCurrency(line.amount)}</strong>
            <p className="muted">{line.attachments.length} receipt attachment(s)</p>
          </div>
          <div className="actions">
            <span className={`badge ${line.missingReceiptFlag ? "warning" : "success"}`}>
              {line.missingReceiptFlag ? "Missing receipt" : "Receipt attached"}
            </span>
            {line.attachments.map((attachment) => (
              <button className="button secondary" key={attachment.attachmentId} onClick={() => void onOpenReceipt(claimId, line.lineItemId, attachment.attachmentId)} type="button">
                <Download size={16} />
                {attachment.originalFileName}
              </button>
            ))}
          </div>
        </div>
      ))}
      {detail.lineItems.length === 0 ? <span className="muted">No line items are available for this audit claim.</span> : null}
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

function FilterField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label>
      <span className="muted">{label}</span>
      <span className="input-with-icon">
        <Search size={16} />
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      </span>
    </label>
  );
}

function SelectField({ label, value, options, onChange, allLabel }: { label: string; value: string; options: string[]; onChange: (value: string) => void; allLabel: string }) {
  return (
    <label>
      <span className="muted">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="All">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>{formatOption(option)}</option>
        ))}
      </select>
    </label>
  );
}

function matchesSummaryFilter(flag: ReturnType<typeof enrichFlag>, filter: SummaryFilter) {
  if (filter === "All") return true;
  if (filter === "HighRisk") return flag.priority === "Critical" || flag.priority === "High";
  if (filter === "Aging") return flag.daysOpen >= 3;
  if (filter === "PendingActions") return true;
  if (filter === "Exposure") return flag.totalAmount > 0;
  if (filter === "Evidence") return flag.flaggedLineItems.length > 0;
  return true;
}

function enrichFlag(flag: FraudFlagItem) {
  const missingReceipts = flag.flaggedLineItems.filter((line) => line.missingReceiptFlag).length;
  const oldExpenseDates = flag.flaggedLineItems.filter((line) => daysSince(line.transactionDate) > 50).length;
  const weekendClaims = flag.flaggedLineItems.filter((line) => isWeekend(line.transactionDate)).length;
  const claimMonths = new Set(flag.flaggedLineItems.map((line) => line.transactionDate.slice(0, 7)));
  const outOfMonthExpenses = claimMonths.size > 1 ? flag.flaggedLineItems.length : 0;
  const repeatedVendors = repeatedVendorCount(flag);
  const manualOverrides = flag.flaggedLineItems.filter((line) => line.vendorInvoiceNumber && line.clientInvoiceNumber).length;
  const advanceSignals = flag.flaggedLineItems.filter((line) => line.expenseTag === "BackendCTC" && line.amount >= 10_000).length;
  const baseByRule: Record<string, number> = {
    DuplicateVoucher: 55,
    ThresholdSplit: 45,
    WeekendOutlier: 35
  };
  const riskScore = Math.min(
    100,
    (baseByRule[flag.ruleName] ?? 30) +
      Math.min(flag.daysOpen * 4, 28) +
      Math.min(flag.relatedClaimCount * 6, 12) +
      Math.min(missingReceipts * 6, 12) +
      Math.min(oldExpenseDates * 5, 10) +
      Math.min(weekendClaims * 4, 8) +
      Math.min(repeatedVendors * 4, 8) +
      Math.min(manualOverrides * 2, 6) +
      Math.min(advanceSignals * 5, 10)
  );

  const riskReasons = [
    flag.ruleLabel,
    missingReceipts > 0 ? "Missing receipts" : null,
    oldExpenseDates > 0 ? "Backdated expense" : null,
    weekendClaims > 0 ? "Weekend claim" : null,
    flag.ruleName === "ThresholdSplit" ? "Split bill pattern" : null,
    repeatedVendors > 0 ? "Repeated vendor use" : null,
    manualOverrides > 0 ? "Manual invoice override" : null,
    outOfMonthExpenses > 0 ? "Out-of-month expense" : null,
    advanceSignals > 0 ? "Advance-limit breach signal" : null
  ].filter((item): item is string => Boolean(item));

  return {
    ...flag,
    exceptionType: exceptionType(flag, missingReceipts, oldExpenseDates, outOfMonthExpenses, advanceSignals),
    riskReasons,
    riskScore,
    priority: riskScore >= 80 ? "Critical" as const : riskScore >= 60 ? "High" as const : "Medium" as const
  };
}

function exceptionType(flag: FraudFlagItem, missingReceipts: number, oldExpenseDates: number, outOfMonthExpenses: number, advanceSignals: number) {
  if (flag.ruleName === "DuplicateVoucher") return "Duplicate voucher";
  if (flag.ruleName === "ThresholdSplit") return "Threshold split";
  if (missingReceipts > 0) return "Missing receipt";
  if (oldExpenseDates > 0) return "Backdated expense";
  if (outOfMonthExpenses > 0) return "Out-of-month expense";
  if (advanceSignals > 0) return "Advance-limit breach";
  return flag.ruleLabel;
}

function priorityTone(priority: "Critical" | "High" | "Medium") {
  if (priority === "Critical") return "danger";
  if (priority === "High") return "warning";
  return "success";
}

function correctionReason(flag: FraudFlagItem) {
  const rejected = flag.approvalTrail?.filter((step) => step.decision === "Rejected").at(-1);
  return rejected?.remarks ?? "Returned claim is waiting for claimant correction.";
}

function remarksForAction(action: AuditAction, owner?: string) {
  const ownerText = owner && owner !== "Unassigned" ? ` Assigned owner: ${owner}.` : "";
  const remarks: Record<AuditAction, string> = {
    Cleared: "Reviewed evidence and found legitimate.",
    Escalated: `Escalated for management audit review.${ownerText}`,
    Clarification: `Clarification requested from claimant with evidence retained.${ownerText}`,
    Suspicious: `Marked suspicious and escalated for investigation.${ownerText}`
  };
  return remarks[action];
}

function lineValues(flag: FraudFlagItem, pick: (line: FraudFlagItem["flaggedLineItems"][number]) => string | null | undefined) {
  return unique(flag.flaggedLineItems.map(pick).filter((item): item is string => Boolean(item)));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function countBy(values: string[]) {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

function repeatedVendorCount(flag: FraudFlagItem) {
  return countBy(flag.flaggedLineItems.map((line) => line.vendorName ?? "")).filter((item) => item.label && item.count > 1).length;
}

function daysSince(dateValue: string) {
  const time = new Date(`${dateValue}T00:00:00`).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

function isWeekend(dateValue: string) {
  const day = new Date(`${dateValue}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function invoiceReferenceLabel(clientInvoiceNumber: string | null, vendorInvoiceNumber: string | null) {
  const references = [
    clientInvoiceNumber ? `Client ${clientInvoiceNumber}` : null,
    vendorInvoiceNumber ? `Vendor ${vendorInvoiceNumber}` : null
  ].filter(Boolean);
  return references.length > 0 ? references.join(" | ") : "No invoice reference";
}

function buildCsv(flags: Array<ReturnType<typeof enrichFlag>>, owners: Record<string, string>) {
  const rows = [
    [
      "Ticket",
      "Claim",
      "Employee",
      "Site",
      "Claim Type",
      "Status",
      "Pending Location",
      "Risk Type",
      "Risk Score",
      "Priority",
      "Days Open",
      "Owner",
      "Vendor",
      "Client Invoice",
      "Vendor Invoice",
      "Amount",
      "Expense Date",
      "Receipt",
      "Approval Trail",
      "Risk Reasons"
    ],
    ...flags.flatMap((flag) =>
      flag.flaggedLineItems.map((line) => [
        flag.ticketId,
        flag.primaryClaimId,
        flag.employeeName,
        flag.siteName ?? "",
        flag.claimKind,
        flag.statusLabel,
        flag.pendingLocation,
        flag.exceptionType,
        String(flag.riskScore),
        flag.priority,
        String(flag.daysOpen),
        owners[flag.flagId] ?? "Unassigned",
        line.vendorName ?? "",
        line.clientInvoiceNumber ?? "",
        line.vendorInvoiceNumber ?? "",
        String(line.amount),
        line.transactionDate,
        line.missingReceiptFlag ? "Missing receipt" : `${line.receiptAttachmentCount ?? 0} attachments`,
        (flag.approvalTrail ?? []).map((step) => `${step.role}:${step.decision}:${step.remarks ?? ""}`).join(" | "),
        flag.riskReasons.join(" | ")
      ])
    )
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function downloadText(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatOption(value: string) {
  if (value === "AlreadyBilled") return "B2C - Already Billed";
  if (value === "PendingBilling") return "B2C - Pending Billing";
  return value;
}

function formatCurrency(value: number) {
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
