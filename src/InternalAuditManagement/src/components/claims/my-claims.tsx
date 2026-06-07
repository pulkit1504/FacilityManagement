"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { ActionFeedback } from "@/components/ui/action-feedback";

type ClaimSummary = {
  claimId: string;
  ticketId: string;
  claimKind: "Advance" | "Reimbursement";
  submissionMode: "SingleVoucher" | "Proforma";
  status: string;
  statusLabel: string;
  totalAmount: number;
  siteId: string | null;
  siteName: string | null;
  createdAt: string;
  updatedAt: string;
};

type ClaimDetail = ClaimSummary & {
  rejectionReason: string | null;
  physicalReceiptConfirmedAt: string | null;
  lineItems: Array<{
    lineItemId: string;
    description: string;
    amount: number;
    transactionDate: string;
    expenseTag: string;
    clientInvoiceNumber: string | null;
    missingReceiptFlag: boolean;
    attachments: Array<{
      attachmentId: string;
      originalFileName: string;
    }>;
  }>;
  approvalSteps: Array<{
    requiredApproverRole: string;
    decision: string;
    decisionAt: string | null;
    remarks: string | null;
  }>;
};

export function MyClaims() {
  const [claims, setClaims] = useState<ClaimSummary[]>([]);
  const [details, setDetails] = useState<Record<string, ClaimDetail>>({});
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const totals = useMemo(
    () => ({
      drafts: claims.filter((claim) => claim.status === "Draft").length,
      inProgress: claims.filter((claim) => ["Submitted", "HodApproved", "MdApproved", "FinanceConfirmed"].includes(claim.status)).length,
      paid: claims.filter((claim) => claim.status === "PaymentReleased").length,
      returned: claims.filter((claim) => claim.status === "Rejected").length
    }),
    [claims]
  );

  async function load() {
    try {
      const response = await fetch("/api/v1/claims", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.detail ?? "Could not load claims.");
        return;
      }
      setClaims(data.items ?? []);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleDetails(claimId: string) {
    if (expandedClaimId === claimId) {
      setExpandedClaimId(null);
      return;
    }

    setExpandedClaimId(claimId);
    if (details[claimId]) return;

    setBusyAction(`details:${claimId}`);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not load claim details.");
      setDetails((current) => ({ ...current, [claimId]: data }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load claim details.");
    } finally {
      setBusyAction(null);
    }
  }

  async function openReceipt(claimId: string, lineItemId: string, attachmentId: string) {
    setBusyAction(`download:${attachmentId}`);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/line-items/${lineItemId}/attachments/${attachmentId}/download`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not open receipt.");
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open receipt.");
    } finally {
      setBusyAction(null);
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

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid cols-3">
        <section className="card metric">
          <span>Drafts</span>
          <strong>{totals.drafts}</strong>
        </section>
        <section className="card metric">
          <span>In progress</span>
          <strong>{totals.inProgress}</strong>
        </section>
        <section className="card metric">
          <span>Paid / Returned</span>
          <strong>
            {totals.paid} / {totals.returned}
          </strong>
        </section>
      </div>

      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Claim History</h2>
            <p className="muted">Track drafts, approvals, finance checks, returns, and payments.</p>
          </div>
        </div>
        <ActionFeedback message={message} onDismiss={() => setMessage("")} />
        <table className="table">
          <thead>
            <tr>
              <th>Claim</th>
              <th>Mode</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6}>
                  <span className="loading-inline">
                    <Loader2 size={16} />
                    Loading claims...
                  </span>
                </td>
              </tr>
            ) : null}
            {!isLoading && claims.map((claim) => (
              <Fragment key={claim.claimId}>
                <tr>
                  <td>
                    <strong>{claim.ticketId ?? claim.claimId.slice(0, 8)}</strong>
                    <br />
                    <span className="muted">{claim.claimKind} · {claim.siteName ?? "No site linked"}</span>
                  </td>
                  <td>{claim.submissionMode === "Proforma" ? "Periodic Proforma" : "Single Voucher"}</td>
                  <td>Rs {claim.totalAmount.toLocaleString("en-IN")}</td>
                  <td>
                    <span className={`badge ${statusTone(claim.status)}`}>{claim.statusLabel}</span>
                  </td>
                  <td>{formatDate(claim.updatedAt)}</td>
                  <td>
                    <div className="actions">
                      {claim.status === "Draft" || claim.status === "Rejected" ? (
                        <Link className="button" href={`/claims/${claim.claimId}/edit`}>
                          {claim.status === "Draft" ? "Continue draft" : "Correct claim"}
                        </Link>
                      ) : null}
                      <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void toggleDetails(claim.claimId)} type="button">
                        {busyAction === `details:${claim.claimId}` ? <Loader2 size={16} /> : <Eye size={16} />}
                        {expandedClaimId === claim.claimId ? "Hide details" : "View details"}
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedClaimId === claim.claimId ? (
                  <tr>
                    <td colSpan={6}>
                      <ClaimDetailPanel
                        claim={details[claim.claimId]}
                        isLoading={!details[claim.claimId]}
                        onOpenReceipt={(lineItemId, attachmentId) => void openReceipt(claim.claimId, lineItemId, attachmentId)}
                        onExportAudit={() => void exportAuditTrail(claim.claimId, claim.ticketId)}
                        busyAction={busyAction}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {!isLoading && claims.length === 0 ? (
              <tr>
                <td colSpan={6}>No claims found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ClaimDetailPanel({
  claim,
  isLoading,
  onOpenReceipt,
  onExportAudit,
  busyAction
}: Readonly<{
  claim?: ClaimDetail;
  isLoading: boolean;
  onOpenReceipt: (lineItemId: string, attachmentId: string) => void;
  onExportAudit: () => void;
  busyAction: string | null;
}>) {
  if (isLoading || !claim) {
    return (
      <span className="loading-inline">
        <Loader2 size={16} />
        Loading claim details...
      </span>
    );
  }

  return (
    <div className="receipt-review">
      {claim.rejectionReason ? (
        <div className="audit-evidence-row">
          <strong>Return reason</strong>
          <span className="muted">{claim.rejectionReason}</span>
          <span className="badge danger">Returned</span>
        </div>
      ) : null}
      <div className="claim-progress">
        {claim.approvalSteps.map((step) => (
          <div className="approval-history-step" key={`${step.requiredApproverRole}:${step.decisionAt ?? "pending"}`}>
            <span className={`badge ${step.decision === "Approved" ? "success" : step.decision === "Rejected" ? "danger" : "warning"}`}>
              {step.requiredApproverRole}: {step.decision}
            </span>
            {step.remarks ? <p className="muted">{step.remarks}</p> : null}
          </div>
        ))}
        {claim.physicalReceiptConfirmedAt ? <span className="badge success">Receipt confirmed</span> : null}
        <button className="button secondary" disabled={Boolean(busyAction?.startsWith("audit:"))} onClick={onExportAudit} type="button">
          {busyAction?.startsWith("audit:") ? <Loader2 size={16} /> : <Download size={16} />}
          Export audit trail
        </button>
      </div>
      {claim.lineItems.map((line) => (
        <div className="approval-line-row" key={line.lineItemId}>
          <div>
            <strong>{line.description}</strong>
            <br />
            <span className="muted">
              {line.transactionDate} · {line.expenseTag}
            </span>
          </div>
          <div>
            <strong>Rs {line.amount.toLocaleString("en-IN")}</strong>
            <br />
            <span className="muted">{line.clientInvoiceNumber ? `Invoice ${line.clientInvoiceNumber}` : "No invoice reference"}</span>
          </div>
          <span className={`badge ${line.missingReceiptFlag ? "warning" : "success"}`}>
            {line.missingReceiptFlag ? "Missing receipt" : "Receipt attached"}
          </span>
          <div className="actions">
            {line.attachments.map((attachment) => (
              <button
                className="button secondary"
                disabled={busyAction === `download:${attachment.attachmentId}`}
                key={attachment.attachmentId}
                onClick={() => onOpenReceipt(line.lineItemId, attachment.attachmentId)}
                type="button"
              >
                {busyAction === `download:${attachment.attachmentId}` ? <Loader2 size={16} /> : <FileText size={16} />}
                {attachment.originalFileName}
              </button>
            ))}
            {line.attachments.length === 0 ? <span className="muted">No upload found</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function statusTone(status: string) {
  if (status === "PaymentReleased" || status === "FinanceConfirmed") return "success";
  if (status === "Rejected") return "danger";
  return "warning";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}
