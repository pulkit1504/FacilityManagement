"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Banknote, ClipboardCheck, Download, Eye, Loader2, X } from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { ClaimSummaryActions } from "@/components/claims/claim-summary-actions";
import { UniversalClaimDrawer } from "@/components/claims/universal-claim-drawer";
import { getProblemMessage } from "@/components/ui/problem-message";
import { SlaChip } from "@/components/ui/sla-chip";

type FinanceItem = {
  claimId: string;
  ticketId: string;
  company: OperatingCompany;
  claimKind: "Advance" | "Reimbursement";
  status: "HodApproved" | "MdApproved" | "FinanceConfirmed";
  submittedBy: string;
  siteName: string | null;
  totalAmount: number;
  advanceAdjustmentAmount: number;
  finalPayableAmount: number;
  netAdvanceLeftAmount: number;
  physicalReceiptRequired: boolean;
  physicalReceiptConfirmed: boolean;
  pendingBillingItemCount: number;
  daysPending: number;
  bankAccountHolderName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
};

type PendingAdvance = {
  claimId: string;
  ticketId: string;
  company: OperatingCompany;
  submittedBy: string;
  siteName: string | null;
  advanceAmount: number;
  settledAmount: number;
  advanceBalance: number;
  ageDays: number;
  settlementStatus: "Open" | "Aging" | "Overdue";
  settlementStatusLabel: string;
};

type OperatingCompany = "Nimbus" | "Striker";
type ReportCompanyFilter = "All" | OperatingCompany;

type ClaimReceiptDetail = {
  ticketId: string;
  lineItems: Array<{
    lineItemId: string;
    expenseHead: string | null;
    description: string;
    amount: number;
    missingReceiptFlag: boolean;
    financeReviewStatus: "Pending" | "Accepted" | "Rejected";
    financeReviewRemarks: string | null;
    attachments: Array<{
      attachmentId: string;
      originalFileName: string;
      fileSizeBytes: number;
      uploadedAt: string;
    }>;
  }>;
};

type FinanceDecision =
  | { kind: "reject-line"; claimId: string; lineItemId: string; title: string }
  | { kind: "return-claim"; claimId: string; title: string };

type FinanceBucket = "All" | "ReviewVouchers" | "ReadyForAudit" | "SentToAudit" | "PaymentReady";

export function FinanceQueue() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [advances, setAdvances] = useState<PendingAdvance[]>([]);
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);
  const [workspaceClaimId, setWorkspaceClaimId] = useState<string | null>(null);
  const [claimDetails, setClaimDetails] = useState<Record<string, ClaimReceiptDetail>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [reportMonth, setReportMonth] = useState("");
  const [reportCompany, setReportCompany] = useState<ReportCompanyFilter>("All");
  const [decision, setDecision] = useState<FinanceDecision | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [bucket, setBucket] = useState<FinanceBucket>("All");
  const decisionDialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  async function load() {
    try {
      const [queueResponse, advancesResponse] = await Promise.all([
        fetch("/api/v1/finance/queue"),
        fetch("/api/v1/finance/advances")
      ]);
      const data = await queueResponse.json();
      const advancesData = await advancesResponse.json();
      if (!queueResponse.ok) {
        setMessage(data.detail ?? "Could not load finance queue.");
        return;
      }
      setItems(data.items ?? []);
      if (advancesResponse.ok) {
        setAdvances(advancesData.items ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const claimId = searchParams.get("claim");
    if (claimId) setWorkspaceClaimId(claimId);
  }, [searchParams]);

  useEffect(() => {
    if (!decision) return;

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDecision();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = decisionDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [decision]);

  async function toggleReceipts(claimId: string) {
    if (expandedClaimId === claimId) {
      setExpandedClaimId(null);
      return;
    }

    setExpandedClaimId(claimId);
    if (claimDetails[claimId]) return;

    setBusyAction(`receipts:${claimId}`);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not load receipts.");
      setClaimDetails((current) => ({ ...current, [claimId]: data }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load receipts.");
    } finally {
      setBusyAction(null);
    }
  }

  async function openReceipt(claimId: string, lineItemId: string, attachmentId: string) {
    setBusyAction(`download:${attachmentId}`);
    try {
      const response = await fetch(
        `/api/v1/claims/${claimId}/line-items/${lineItemId}/attachments/${attachmentId}/download`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not open receipt.");
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open receipt.");
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmReceipt(claimId: string) {
    const now = new Date();
    setBusyAction(`confirm:${claimId}`);
    setMessage("Confirming physical receipt...");
    try {
      const response = await fetch(`/api/v1/finance/${claimId}/confirm-physical-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          physicalReceiptDate: now.toISOString().slice(0, 10),
          physicalReceiptTime: now.toTimeString().slice(0, 5),
          receivedByName: "Finance desk"
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Receipt confirmation failed.");
      setMessage(data.message ?? "Physical receipt confirmed.");
      setItems((current) =>
        current.map((item) =>
          item.claimId === claimId ? { ...item, physicalReceiptConfirmed: true } : item
        )
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Receipt confirmation failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReceiptGate(item: FinanceItem) {
    if (!claimDetails[item.claimId]) {
      await toggleReceipts(item.claimId);
      setMessage("Review and accept every voucher line, then send the pack to Audit.");
      return;
    }

    await confirmReceipt(item.claimId);
  }

  async function releasePayment(claimId: string) {
    setBusyAction(`release:${claimId}`);
    setMessage("Releasing payment...");
    try {
      const response = await fetch(`/api/v1/finance/${claimId}/release-payment`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Payment release failed.");
      setMessage(data.message ?? "Payment action completed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment release failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function reviewLine(claimId: string, lineItemId: string, lineDecision: "Accepted" | "Rejected", remarks = "") {
    setBusyAction(`review:${lineItemId}`);
    setMessage(lineDecision === "Accepted" ? "Accepting line item..." : "Rejecting line item...");
    try {
      const response = await fetch(`/api/v1/finance/${claimId}/line-items/${lineItemId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: lineDecision, remarks: remarks || null })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getProblemMessage(data, "Line review failed."));
      setMessage(data.message ?? "Line item reviewed.");
      setClaimDetails((current) => ({
        ...current,
        [claimId]: {
          ...current[claimId],
          lineItems: (current[claimId]?.lineItems ?? []).map((line) =>
            line.lineItemId === lineItemId
              ? {
                  ...line,
                  financeReviewStatus: data.financeReviewStatus,
                  financeReviewRemarks: data.financeReviewRemarks
                }
              : line
          )
        }
      }));
      closeDecision();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Line review failed.";
      if (lineDecision === "Rejected") setDecisionError(errorMessage);
      else setMessage(errorMessage);
    } finally {
      setBusyAction(null);
    }
  }

  async function correctExpenseHead(claimId: string, lineItemId: string, currentExpenseHead: string | null) {
    const expenseHead = window.prompt("Correct expense head", currentExpenseHead ?? "");
    if (!expenseHead) return;

    setBusyAction(`expense-head:${lineItemId}`);
    setMessage("Correcting expense head...");
    try {
      const response = await fetch(`/api/v1/finance/${claimId}/line-items/${lineItemId}/expense-head`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseHead })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getProblemMessage(data, "Expense head correction failed."));
      setClaimDetails((current) => ({
        ...current,
        [claimId]: {
          ...current[claimId],
          lineItems: (current[claimId]?.lineItems ?? []).map((line) =>
            line.lineItemId === lineItemId
              ? { ...line, expenseHead: data.lineItem.expenseHead }
              : line
          )
        }
      }));
      setMessage(data.message ?? "Expense head corrected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Expense head correction failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function returnClaim(claimId: string, reason: string) {
    setBusyAction(`return:${claimId}`);
    setMessage("Returning claim...");
    try {
      const response = await fetch(`/api/v1/approvals/${claimId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getProblemMessage(data, "Could not return claim."));
      setMessage(data.message ?? "Claim returned.");
      closeDecision();
      await load();
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "Could not return claim.");
    } finally {
      setBusyAction(null);
    }
  }

  function openDecision(nextDecision: FinanceDecision) {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDecision(nextDecision);
    setDecisionRemarks("");
    setDecisionError("");
  }

  function closeDecision() {
    setDecision(null);
    setDecisionRemarks("");
    setDecisionError("");
  }

  async function submitDecision() {
    const remarks = decisionRemarks.trim();
    if (remarks.length < 5) {
      setDecisionError("Enter a clear reason of at least 5 characters so the claimant knows what to correct.");
      return;
    }
    if (!decision) return;
    if (decision.kind === "reject-line") {
      await reviewLine(decision.claimId, decision.lineItemId, "Rejected", remarks);
    } else {
      await returnClaim(decision.claimId, remarks);
    }
  }

  async function exportAuditTrail(claimId: string, ticketId: string) {
    setBusyAction(`audit:${claimId}`);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/audit/export`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail ?? "Could not export audit trail.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${ticketId}-audit-trail.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export audit trail.");
    } finally {
      setBusyAction(null);
    }
  }

  function allLinesAccepted(item: FinanceItem) {
    if (item.claimKind === "Advance") return true;
    const details = claimDetails[item.claimId];
    if (!details) return false;
    return details.lineItems.length > 0 && details.lineItems.every((line) => line.financeReviewStatus === "Accepted");
  }

  function hasLoadedReceiptLines(item: FinanceItem) {
    return Boolean(claimDetails[item.claimId]);
  }

  function beneficiaryReady(item: FinanceItem) {
    return item.finalPayableAmount <= 0 || Boolean(
      item.bankAccountHolderName && item.bankAccountNumber && item.bankIfsc && item.bankName
    );
  }

  function auditApproved(item: FinanceItem) {
    return item.claimKind === "Advance" || item.status === "FinanceConfirmed";
  }

  const reportParams = new URLSearchParams();
  if (reportMonth) reportParams.set("month", reportMonth);
  if (reportCompany !== "All") reportParams.set("company", reportCompany);
  const reportQuery = reportParams.toString() ? `?${reportParams.toString()}` : "";
  const recordSearch = (searchParams.get("q") ?? "").trim().toLowerCase();
  const filteredItems = items.filter((item) => (
    matchesFinanceBucket(item, bucket, claimDetails[item.claimId]) &&
    matchesFinanceSearch(item, recordSearch, claimDetails[item.claimId])
  ));
  const filteredAdvances = advances.filter((advance) => matchesText(recordSearch, [
    advance.ticketId,
    advance.company,
    advance.submittedBy,
    advance.siteName,
    advance.settlementStatusLabel,
    String(advance.advanceAmount),
    String(advance.advanceBalance)
  ]));

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section aria-label="Finance queue table" className="panel" tabIndex={0}>
        <div className="topbar" style={{ marginBottom: 12 }}>
          <h2>Finance Queue</h2>
          <div className="actions">
            {recordSearch ? <span className="badge success">Search: {recordSearch}</span> : null}
            <select aria-label="Report company" value={reportCompany} onChange={(event) => setReportCompany(event.target.value as ReportCompanyFilter)}>
              <option value="All">All companies</option>
              <option value="Nimbus">Nimbus</option>
              <option value="Striker">Striker</option>
            </select>
            <input aria-label="Report month" type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} />
            <a className="button secondary" href={`/api/v1/finance/reports/company-expenses${reportQuery}`}>
              <Download size={16} />
              Company CSV
            </a>
            <a className="button secondary" href={`/api/v1/finance/reports/imprest${reportQuery}`}>
              <Download size={16} />
              Imprest CSV
            </a>
            <a className="button secondary" href={`/api/v1/finance/reports/billable${reportQuery}`}>
              <Download size={16} />
              Billable CSV
            </a>
          </div>
        </div>
        <div aria-label="Finance action buckets" className="queue-tabs">
          {financeBuckets(items, claimDetails).map((item) => (
            <button
              aria-pressed={bucket === item.bucket}
              className={`queue-tab ${bucket === item.bucket ? "active" : ""}`}
              key={item.bucket}
              onClick={() => setBucket(item.bucket)}
              type="button"
            >
              <strong>{item.count}</strong>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <ActionFeedback message={message} onDismiss={() => setMessage("")} />
        <table className="table">
        <thead>
          <tr>
            <th>Claim</th>
            <th>Payable / advance</th>
            <th>Beneficiary</th>
            <th>Receipt gate</th>
            <th>Billing</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={6}>
                <span className="loading-inline">
                  <Loader2 size={16} />
                  Loading finance queue...
                </span>
              </td>
            </tr>
          ) : null}
          {!isLoading && filteredItems.map((item) => (
            <Fragment key={item.claimId}>
              <tr key={item.claimId}>
                <td>
                  <strong>{item.ticketId ?? item.claimId.slice(0, 8)}</strong>
                  <br />
                  <span className="muted">{item.company} · {item.claimKind} · {item.submittedBy}</span>
                  <br />
                  <SlaChip days={item.daysPending} />
                </td>
                <td>
                  <strong>
                    Rs {(item.netAdvanceLeftAmount > 0 ? item.netAdvanceLeftAmount : item.finalPayableAmount).toLocaleString("en-IN")}
                  </strong>
                  <br />
                  <span className="muted">
                    {item.netAdvanceLeftAmount > 0 ? "advance left" : "payable"} from Rs {item.totalAmount.toLocaleString("en-IN")}
                    {item.advanceAdjustmentAmount > 0 ? ` less Rs ${item.advanceAdjustmentAmount.toLocaleString("en-IN")} advance` : ""}
                  </span>
                </td>
                <td>
                  {item.bankName ?? "Bank not captured"}
                  <br />
                  <span className="muted">
                    {item.bankAccountNumber ? `${item.bankAccountHolderName ?? "Account"} ${maskAccount(item.bankAccountNumber)} ${item.bankIfsc ?? ""}` : "No beneficiary details"}
                  </span>
                  {!beneficiaryReady(item) ? <span className="badge danger">Payment blocked</span> : null}
                </td>
                <td>
                  <span className={`badge ${item.physicalReceiptConfirmed ? "success" : "warning"}`}>
                    {!item.physicalReceiptRequired ? "Not required" : item.physicalReceiptConfirmed ? "Confirmed" : "Pending"}
                  </span>
                </td>
                <td>{item.pendingBillingItemCount} B2C - Pending Billing items</td>
                <td>
                  <div className="actions">
                    <button className="button secondary" onClick={() => void toggleReceipts(item.claimId)} type="button">
                      {busyAction === `receipts:${item.claimId}` ? <Loader2 size={16} /> : <Eye size={16} />}
                      {expandedClaimId === item.claimId ? "Hide receipts" : "View receipts"}
                    </button>
                    <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => setWorkspaceClaimId(item.claimId)} type="button">
                      <Eye size={16} />
                      Open workspace
                    </button>
                    <button
                      className="button secondary"
                      disabled={
                        !item.physicalReceiptRequired ||
                        item.physicalReceiptConfirmed ||
                        (hasLoadedReceiptLines(item) && !allLinesAccepted(item)) ||
                        busyAction === `confirm:${item.claimId}` ||
                        busyAction === `receipts:${item.claimId}`
                      }
                      onClick={() => void handleReceiptGate(item)}
                      type="button"
                      title={!hasLoadedReceiptLines(item) ? "Open voucher review first" : !allLinesAccepted(item) ? "Accept every voucher line before sending to Audit" : "Confirm the complete voucher pack and send it to Audit"}
                    >
                      {busyAction === `confirm:${item.claimId}` || busyAction === `receipts:${item.claimId}` ? <Loader2 size={16} /> : <ClipboardCheck size={16} />}
                      {!item.physicalReceiptRequired ? "No receipt gate" : item.physicalReceiptConfirmed ? "Sent to Audit" : !hasLoadedReceiptLines(item) ? "Review vouchers" : !allLinesAccepted(item) ? "Accept all lines" : "Send to Audit"}
                    </button>
                    <button
                      className="button"
                      disabled={
                        (item.physicalReceiptRequired && !item.physicalReceiptConfirmed) ||
                        !auditApproved(item) ||
                        !allLinesAccepted(item) ||
                        !beneficiaryReady(item) ||
                        busyAction === `release:${item.claimId}`
                      }
                      onClick={() => void releasePayment(item.claimId)}
                      type="button"
                      title={
                        !beneficiaryReady(item)
                          ? "Complete beneficiary bank details before releasing payment"
                          : !auditApproved(item)
                            ? "Payment release is available only after Auditor approval"
                            : "Release payment"
                      }
                    >
                      {busyAction === `release:${item.claimId}` ? <Loader2 size={16} /> : <Banknote size={16} />}
                      {!beneficiaryReady(item) ? "Bank details required" : !allLinesAccepted(item) ? "Review lines" : !auditApproved(item) ? "Awaiting Audit" : !item.physicalReceiptRequired || item.physicalReceiptConfirmed ? "Release" : "Receipt pending"}
                    </button>
                    <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => openDecision({ kind: "return-claim", claimId: item.claimId, title: item.ticketId })} type="button">
                      {busyAction === `return:${item.claimId}` ? <Loader2 size={16} /> : null}
                      Return
                    </button>
                    <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void exportAuditTrail(item.claimId, item.ticketId)} type="button">
                      {busyAction === `audit:${item.claimId}` ? <Loader2 size={16} /> : <Download size={16} />}
                      Audit CSV
                    </button>
                    <ClaimSummaryActions claimId={item.claimId} onError={setMessage} ticketId={item.ticketId} />
                  </div>
                </td>
              </tr>
              {expandedClaimId === item.claimId ? (
                <tr key={`${item.claimId}-receipts`}>
                  <td colSpan={6}>
                    <div className="receipt-review">
                      {(claimDetails[item.claimId]?.lineItems ?? []).map((line) => (
                        <div className="receipt-row" key={line.lineItemId}>
                          <div>
                            <strong>{line.description}</strong>
                            <br />
                            <span className="muted">Rs {line.amount.toLocaleString("en-IN")}</span>
                            <br />
                            <span className="muted">Expense head: {line.expenseHead ?? "Not set"}</span>
                          </div>
                          <span className={`badge ${line.missingReceiptFlag ? "warning" : "success"}`}>
                            {line.missingReceiptFlag ? "Missing receipt" : "Receipt attached"}
                          </span>
                          <span className={`badge ${line.financeReviewStatus === "Accepted" ? "success" : line.financeReviewStatus === "Rejected" ? "danger" : "warning"}`}>
                            {line.financeReviewStatus}
                          </span>
                          <div className="actions">
                            <button
                              className={line.financeReviewStatus === "Accepted" ? "button accepted" : "button secondary"}
                              disabled={Boolean(busyAction) || line.financeReviewStatus === "Accepted"}
                              onClick={() => void reviewLine(item.claimId, line.lineItemId, "Accepted")}
                              type="button"
                            >
                              {line.financeReviewStatus === "Accepted" ? <ClipboardCheck size={16} /> : null}
                              {line.financeReviewStatus === "Accepted" ? "Accepted" : "Accept"}
                            </button>
                            <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void correctExpenseHead(item.claimId, line.lineItemId, line.expenseHead)} type="button">
                              {busyAction === `expense-head:${line.lineItemId}` ? <Loader2 size={16} /> : null}
                              Correct head
                            </button>
                            <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => openDecision({ kind: "reject-line", claimId: item.claimId, lineItemId: line.lineItemId, title: line.description })} type="button">
                              Reject
                            </button>
                            {line.attachments.map((attachment) => (
                              <button
                                className="button secondary"
                                key={attachment.attachmentId}
                                onClick={() => void openReceipt(item.claimId, line.lineItemId, attachment.attachmentId)}
                                type="button"
                              >
                                {busyAction === `download:${attachment.attachmentId}` ? <Loader2 size={16} /> : <Eye size={16} />}
                                {attachment.originalFileName}
                              </button>
                            ))}
                            {line.attachments.length === 0 ? <span className="muted">No upload found</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
          {!isLoading && filteredItems.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <div className="table-empty-state">
                  <strong>{recordSearch ? "No finance items match this search" : "No voucher packs pending"}</strong>
                  <span>{recordSearch ? "Clear the search or try ticket, claimant, site, amount, or bank reference." : "Finance has no claims waiting for voucher review, Audit handoff, or payment release."}</span>
                </div>
              </td>
            </tr>
          ) : null}
        </tbody>
        </table>
      </section>

      <section aria-label="Advances with open balances table" className="panel" tabIndex={0}>
        <h2>Advances with open balances</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Advance</th>
              <th>Claimant</th>
              <th>Company</th>
              <th>Site</th>
              <th>Advance</th>
              <th>Settled</th>
              <th>Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8}>
                  <span className="loading-inline">
                    <Loader2 size={16} />
                    Loading advances...
                  </span>
                </td>
              </tr>
            ) : null}
            {!isLoading && filteredAdvances.map((advance) => (
              <tr key={advance.claimId}>
                <td>
                  <strong>{advance.ticketId}</strong>
                  <br />
                  <SlaChip days={advance.ageDays} />
                </td>
                <td>{advance.submittedBy}</td>
                <td>{advance.company}</td>
                <td>{advance.siteName ?? "No site linked"}</td>
                <td>Rs {advance.advanceAmount.toLocaleString("en-IN")}</td>
                <td>Rs {advance.settledAmount.toLocaleString("en-IN")}</td>
                <td>
                  <span className="badge warning">Rs {advance.advanceBalance.toLocaleString("en-IN")}</span>
                </td>
                <td>
                  <span className={`badge ${advance.settlementStatus === "Overdue" ? "danger" : advance.settlementStatus === "Aging" ? "warning" : "success"}`}>
                    {advance.settlementStatusLabel}
                  </span>
                </td>
              </tr>
            ))}
            {!isLoading && filteredAdvances.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="table-empty-state">
                    <strong>{recordSearch ? "No advances match this search" : "No open advance balances"}</strong>
                    <span>{recordSearch ? "Try searching by ticket, claimant, site, amount, or settlement status." : "All paid advances are fully settled or no paid advances are currently open."}</span>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {decision ? (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeDecision()}>
          <div
            aria-describedby="finance-decision-description"
            aria-labelledby="finance-decision-title"
            aria-modal="true"
            className="modal"
            ref={decisionDialogRef}
            role="dialog"
          >
            <div className="section-heading">
              <div>
                <h2 id="finance-decision-title">{decision.kind === "reject-line" ? "Reject line item" : "Return claim"}</h2>
                <p className="muted" id="finance-decision-description">
                  {decision.kind === "reject-line"
                    ? `Explain what Finance needs corrected for ${decision.title}.`
                    : `Explain what the claimant needs to correct in ${decision.title}.`}
                </p>
              </div>
              <button aria-label="Close decision dialog" className="icon-button" disabled={Boolean(busyAction)} onClick={closeDecision} type="button">
                <X size={18} />
              </button>
            </div>
            <label>
              <span className="muted">Reason for correction</span>
              <textarea
                autoFocus
                maxLength={1000}
                onChange={(event) => {
                  setDecisionRemarks(event.target.value);
                  setDecisionError("");
                }}
                placeholder="Describe the issue and the expected correction"
                rows={5}
                value={decisionRemarks}
              />
            </label>
            {decisionError ? (
              <p className="field-error" role="alert">
                <AlertTriangle size={16} />
                {decisionError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button className="button secondary" disabled={Boolean(busyAction)} onClick={closeDecision} type="button">Cancel</button>
              <button className="button danger" disabled={Boolean(busyAction)} onClick={() => void submitDecision()} type="button">
                {busyAction ? <Loader2 size={16} /> : null}
                {decision.kind === "reject-line" ? "Reject line" : "Return to claimant"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <UniversalClaimDrawer claimId={workspaceClaimId} isOpen={Boolean(workspaceClaimId)} onClose={() => setWorkspaceClaimId(null)} onError={setMessage} />
    </div>
  );
}

function maskAccount(value: string) {
  if (value.length <= 4) return value;
  return `****${value.slice(-4)}`;
}

function matchesFinanceSearch(item: FinanceItem, query: string, detail?: ClaimReceiptDetail) {
  return matchesText(query, [
    item.claimId,
    item.ticketId,
    item.company,
    item.claimKind,
    item.status,
    item.submittedBy,
    item.siteName,
    item.bankAccountHolderName,
    item.bankAccountNumber,
    item.bankIfsc,
    item.bankName,
    String(item.totalAmount),
    String(item.finalPayableAmount),
    ...(detail?.lineItems.flatMap((line) => [
      line.description,
      String(line.amount),
      line.financeReviewStatus,
      line.financeReviewRemarks,
      ...line.attachments.map((attachment) => attachment.originalFileName)
    ]) ?? [])
  ]);
}

function financeBuckets(items: FinanceItem[], details: Record<string, ClaimReceiptDetail>) {
  return [
    { bucket: "All" as const, label: "All finance work", count: items.length },
    { bucket: "ReviewVouchers" as const, label: "Voucher review", count: items.filter((item) => matchesFinanceBucket(item, "ReviewVouchers", details[item.claimId])).length },
    { bucket: "ReadyForAudit" as const, label: "Audit-ready packs", count: items.filter((item) => matchesFinanceBucket(item, "ReadyForAudit", details[item.claimId])).length },
    { bucket: "SentToAudit" as const, label: "Audit-sent packs", count: items.filter((item) => matchesFinanceBucket(item, "SentToAudit", details[item.claimId])).length },
    { bucket: "PaymentReady" as const, label: "Payment ready", count: items.filter((item) => matchesFinanceBucket(item, "PaymentReady", details[item.claimId])).length }
  ];
}

function matchesFinanceBucket(item: FinanceItem, bucket: FinanceBucket, detail?: ClaimReceiptDetail) {
  if (bucket === "All") return true;
  if (bucket === "PaymentReady") return item.status === "FinanceConfirmed";
  if (bucket === "SentToAudit") return item.physicalReceiptConfirmed && item.status !== "FinanceConfirmed";
  if (bucket === "ReadyForAudit") {
    return item.physicalReceiptRequired &&
      !item.physicalReceiptConfirmed &&
      Boolean(detail?.lineItems.length) &&
      Boolean(detail?.lineItems.every((line) => line.financeReviewStatus === "Accepted"));
  }
  if (bucket === "ReviewVouchers") return item.physicalReceiptRequired && !item.physicalReceiptConfirmed;
  return true;
}

function matchesText(query: string, values: Array<string | number | null | undefined>) {
  if (!query) return true;
  return values
    .filter((value): value is string | number => value !== null && value !== undefined)
    .some((value) => String(value).toLowerCase().includes(query));
}
