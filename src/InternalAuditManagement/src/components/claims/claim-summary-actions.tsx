"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, Loader2, X } from "lucide-react";
import { getProblemMessage } from "@/components/ui/problem-message";

type ClaimSummary = {
  ticketId: string;
  statusLabel: string;
  claimKind: string;
  submissionMode: string;
  claimPeriodMonth: string | null;
  totalAmount: number;
  advanceAdjustmentAmount: number;
  finalPayableAmount: number;
  createdAt: string;
  updatedAt: string;
  lineItems: Array<{
    lineItemId: string;
    expenseHead: string | null;
    description: string;
    transactionDate: string;
    expenseTag: string;
    vendorName: string | null;
    vendorInvoiceNumber: string | null;
    clientInvoiceNumber: string | null;
    amount: number;
    missingReceiptFlag: boolean;
    financeReviewStatus: string;
  }>;
};

type ClaimSummaryActionsProps = {
  claimId: string;
  ticketId: string;
  onError?: (message: string) => void;
};

export function ClaimSummaryActions({ claimId, ticketId, onError }: Readonly<ClaimSummaryActionsProps>) {
  const [summary, setSummary] = useState<ClaimSummary | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<"view" | "download" | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
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

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen]);

  async function viewSummary() {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusyAction("view");
    try {
      if (!summary) {
        const response = await fetch(`/api/v1/claims/${claimId}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(getProblemMessage(data, "Could not load claim summary."));
        setSummary(data);
      }
      setIsOpen(true);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Could not load claim summary.");
    } finally {
      setBusyAction(null);
    }
  }

  async function downloadSummary() {
    setBusyAction("download");
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/summary/export`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(getProblemMessage(data, "Could not download claim summary."));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = contentDispositionFileName(response.headers.get("Content-Disposition")) ?? `${ticketId}-summary.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Could not download claim summary.");
    } finally {
      setBusyAction(null);
    }
  }

  function close() {
    setIsOpen(false);
  }

  return (
    <>
      <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void viewSummary()} type="button">
        {busyAction === "view" ? <Loader2 size={16} /> : <Eye size={16} />}
        View summary
      </button>
      <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void downloadSummary()} type="button">
        {busyAction === "download" ? <Loader2 size={16} /> : <Download size={16} />}
        Summary CSV
      </button>

      {isOpen && summary ? (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <div
            aria-describedby={`claim-summary-description-${claimId}`}
            aria-labelledby={`claim-summary-title-${claimId}`}
            aria-modal="true"
            className="modal claim-summary-modal"
            ref={dialogRef}
            role="dialog"
          >
            <div className="section-heading">
              <div>
                <span className="badge success"><FileText size={14} /> Claim summary report</span>
                <h2 id={`claim-summary-title-${claimId}`}>{summary.ticketId}</h2>
                <p className="muted" id={`claim-summary-description-${claimId}`}>
                  Finance and audit review snapshot with claim totals and voucher evidence.
                </p>
              </div>
              <button aria-label="Close claim summary" autoFocus className="icon-button" onClick={close} type="button">
                <X size={18} />
              </button>
            </div>

            <div className="claim-summary-metrics">
              <SummaryMetric label="Status" value={summary.statusLabel} />
              <SummaryMetric label="Claim type" value={summary.claimKind} />
              <SummaryMetric label="Expense month" value={summary.claimPeriodMonth ?? "Not specified"} />
              <SummaryMetric label="Total claimed" value={formatCurrency(summary.totalAmount)} />
              <SummaryMetric label="Advance adjusted" value={formatCurrency(summary.advanceAdjustmentAmount)} />
              <SummaryMetric label="Final payable" value={formatCurrency(summary.finalPayableAmount)} />
            </div>

            <div className="claim-summary-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Expense</th>
                    <th>Vendor / invoices</th>
                    <th>Evidence</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.lineItems.map((line) => (
                    <tr key={line.lineItemId}>
                      <td>
                        <strong>{line.description}</strong>
                        <br />
                        <span className="muted">{line.expenseHead ?? "No expense head"} | {line.transactionDate} | {line.expenseTag}</span>
                      </td>
                      <td>
                        {line.vendorName ?? "No vendor"}
                        <br />
                        <span className="muted">Vendor: {line.vendorInvoiceNumber ?? "Not provided"} | Client: {line.clientInvoiceNumber ?? "Not applicable"}</span>
                      </td>
                      <td>
                        <span className={`badge ${line.missingReceiptFlag ? "danger" : "success"}`}>
                          {line.missingReceiptFlag ? "Receipt missing" : "Receipt attached"}
                        </span>
                        <br />
                        <span className="muted">Finance review: {line.financeReviewStatus}</span>
                      </td>
                      <td><strong>{formatCurrency(line.amount)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="claim-summary-footer">
              <span className="muted">Created {formatTimestamp(summary.createdAt)} | Updated {formatTimestamp(summary.updatedAt)}</span>
              <button className="button" disabled={busyAction === "download"} onClick={() => void downloadSummary()} type="button">
                {busyAction === "download" ? <Loader2 size={16} /> : <Download size={16} />}
                Download summary CSV
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SummaryMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatCurrency(value: number) {
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function contentDispositionFileName(value: string | null) {
  return value?.match(/filename="([^"]+)"/i)?.[1] ?? null;
}
