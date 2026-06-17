"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2, MessageSquare, Paperclip } from "lucide-react";
import { ClaimTimeline } from "@/components/claims/claim-timeline";
import { ClaimWorkspaceDrawer } from "@/components/claims/claim-workspace-drawer";
import { getProblemMessage } from "@/components/ui/problem-message";
import { expenseTagLabel } from "@/shared/expense-tags";

type WorkspaceAttachment = {
  attachmentId: string;
  contentHash: string;
  duplicateContentHash: boolean;
  fileSizeBytes: number;
  originalFileName: string;
  uploadedAt: string;
  uploadedByName: string;
};

type WorkspaceLine = {
  lineItemId: string;
  description: string;
  amount: number;
  transactionDate: string;
  paymentMode: "Cash" | "UPI" | null;
  expenseTag: string;
  clientInvoiceNumber: string | null;
  vendorName: string | null;
  vendorInvoiceNumber: string | null;
  missingReceiptFlag: boolean;
  financeReviewStatus: string;
  financeReviewRemarks: string | null;
  attachments: WorkspaceAttachment[];
};

type WorkspaceData = {
  claim: {
    claimId: string;
    ticketId: string;
    claimKind: string;
    submissionMode: string;
    status: string;
    statusLabel: string;
    totalAmount: number;
    advanceAdjustmentAmount: number;
    finalPayableAmount: number;
    netAdvanceLeftAmount: number;
    rejectionReason: string | null;
    physicalReceiptConfirmedAt: string | null;
    createdAt: string;
    updatedAt: string;
    lineItems: WorkspaceLine[];
    approvalSteps: Array<{
      requiredApproverRole: string;
      decision: string;
      decisionAt: string | null;
      remarks: string | null;
    }>;
  };
  auditTrail: Array<{
    auditId: string;
    actorName: string | null;
    actorUserId: string;
    actionType: string;
    auditRemarks: string | null;
    actionTimestamp: string;
    preActionStatus: string | null;
    postActionStatus: string;
  }>;
  comments: Array<{
    id: string;
    author: string;
    body: string;
    source: string;
    timestamp: string;
  }>;
  receiptQuality: {
    totalLines: number;
    linesMissingReceipts: number;
    totalReceipts: number;
    duplicateReceiptHashes: number;
  };
  availableActions: string[];
};

type UniversalClaimDrawerProps = {
  claimId: string | null;
  extraActions?: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  onError?: (message: string) => void;
};

export function UniversalClaimDrawer({ claimId, extraActions, isOpen, onClose, onError }: UniversalClaimDrawerProps) {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOpen || !claimId) return;
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setMessage("");
      try {
        const response = await fetch(`/api/v1/claims/${claimId}/workspace`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(getProblemMessage(data, "Could not load claim workspace."));
        if (isMounted) setWorkspace(data);
      } catch (error) {
        const text = error instanceof Error ? error.message : "Could not load claim workspace.";
        if (isMounted) setMessage(text);
        onError?.(text);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [claimId, isOpen, onError]);

  const title = workspace?.claim.ticketId ?? "Claim workspace";
  const subtitle = workspace?.claim.statusLabel ?? (claimId ? "Loading claim workspace..." : undefined);
  const claim = workspace?.claim;

  async function openReceipt(lineItemId: string, attachmentId: string) {
    if (!claimId) return;
    setBusyAction(`download:${attachmentId}`);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/line-items/${lineItemId}/attachments/${attachmentId}/download`);
      const data = await response.json();
      if (!response.ok) throw new Error(getProblemMessage(data, "Could not open receipt."));
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Could not open receipt.";
      setMessage(text);
      onError?.(text);
    } finally {
      setBusyAction(null);
    }
  }

  async function exportFile(path: "audit" | "summary") {
    if (!claimId || !claim) return;
    setBusyAction(`${path}:${claimId}`);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/${path === "audit" ? "audit" : "summary"}/export`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(getProblemMessage(data, `Could not export ${path}.`));
      }
      await downloadResponse(response, `${claim.ticketId}-${path === "audit" ? "audit-trail" : "summary"}.csv`);
    } catch (error) {
      const text = error instanceof Error ? error.message : `Could not export ${path}.`;
      setMessage(text);
      onError?.(text);
    } finally {
      setBusyAction(null);
    }
  }

  async function submitComment() {
    if (!claimId) return;
    const trimmed = comment.trim();
    if (trimmed.length < 3) {
      setMessage("Enter a comment of at least 3 characters.");
      return;
    }

    setBusyAction("comment");
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getProblemMessage(data, "Could not add comment."));
      setComment("");
      setMessage(data.message ?? "Comment added.");
      const refresh = await fetch(`/api/v1/claims/${claimId}/workspace`, { cache: "no-store" });
      const next = await refresh.json();
      if (refresh.ok) setWorkspace(next);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Could not add comment.";
      setMessage(text);
      onError?.(text);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <ClaimWorkspaceDrawer isOpen={isOpen} onClose={onClose} subtitle={subtitle} title={title}>
      {isLoading ? (
        <span className="loading-inline"><Loader2 size={16} />Loading claim workspace...</span>
      ) : null}
      {message ? <p className="field-error">{message}</p> : null}
      {workspace && claim ? (
        <div className="claim-workspace-stack">
          <ClaimTimeline approvalSteps={claim.approvalSteps} physicalReceiptConfirmedAt={claim.physicalReceiptConfirmedAt} status={claim.status} />
          <WorkspaceSummary workspace={workspace} />
          <section className="workspace-section">
            <h3>Available actions</h3>
            <div className="actions">
              {workspace.availableActions.map((action) => <span className="badge success" key={action}>{action}</span>)}
              {extraActions}
            </div>
          </section>
          <LineItemsSection claim={claim} busyAction={busyAction} onOpenReceipt={(lineId, attachmentId) => void openReceipt(lineId, attachmentId)} />
          <AuditTrailSection entries={workspace.auditTrail} />
          <CommentsSection
            busyAction={busyAction}
            comment={comment}
            comments={workspace.comments}
            onChange={setComment}
            onSubmit={() => void submitComment()}
          />
          <div className="actions">
            <button className="button secondary" disabled={busyAction?.startsWith("audit:")} onClick={() => void exportFile("audit")} type="button">
              {busyAction?.startsWith("audit:") ? <Loader2 size={16} /> : <Download size={16} />}
              Export audit trail
            </button>
            <button className="button secondary" disabled={busyAction?.startsWith("summary:")} onClick={() => void exportFile("summary")} type="button">
              {busyAction?.startsWith("summary:") ? <Loader2 size={16} /> : <Download size={16} />}
              Download summary
            </button>
          </div>
        </div>
      ) : null}
    </ClaimWorkspaceDrawer>
  );
}

function WorkspaceSummary({ workspace }: { workspace: WorkspaceData }) {
  const { claim, receiptQuality } = workspace;
  return (
    <section className="workspace-section">
      <h3>Claim summary</h3>
      <div className="workspace-summary-grid">
        <SummaryMetric label="Type" value={`${claim.claimKind} | ${claim.submissionMode === "Proforma" ? "Periodic" : "Single voucher"}`} />
        <SummaryMetric label="Total" value={`Rs ${claim.totalAmount.toLocaleString("en-IN")}`} />
        <SummaryMetric label="Final payable" value={`Rs ${claim.finalPayableAmount.toLocaleString("en-IN")}`} />
        <SummaryMetric label="Updated" value={formatTimestamp(claim.updatedAt)} />
      </div>
      <div className="receipt-quality-grid">
        <QualityChip label="Lines" tone="success" value={String(receiptQuality.totalLines)} />
        <QualityChip label="Receipts" tone={receiptQuality.totalReceipts > 0 ? "success" : "warning"} value={String(receiptQuality.totalReceipts)} />
        <QualityChip label="Missing receipt" tone={receiptQuality.linesMissingReceipts > 0 ? "warning" : "success"} value={String(receiptQuality.linesMissingReceipts)} />
        <QualityChip label="Duplicate hash" tone={receiptQuality.duplicateReceiptHashes > 0 ? "danger" : "success"} value={String(receiptQuality.duplicateReceiptHashes)} />
      </div>
      {claim.rejectionReason ? <p className="field-error">{claim.rejectionReason}</p> : null}
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="workspace-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QualityChip({ label, tone, value }: { label: string; tone: "success" | "warning" | "danger"; value: string }) {
  return <span className={`badge ${tone}`}>{label}: {value}</span>;
}

function LineItemsSection({
  claim,
  busyAction,
  onOpenReceipt
}: {
  claim: WorkspaceData["claim"];
  busyAction: string | null;
  onOpenReceipt: (lineItemId: string, attachmentId: string) => void;
}) {
  const duplicateHashes = useMemo(() => {
    const counts = claim.lineItems.flatMap((line) => line.attachments.map((attachment) => attachment.contentHash)).reduce<Record<string, number>>((acc, hash) => {
      acc[hash] = (acc[hash] ?? 0) + 1;
      return acc;
    }, {});
    return new Set(Object.entries(counts).filter(([, count]) => count > 1).map(([hash]) => hash));
  }, [claim.lineItems]);

  return (
    <section className="workspace-section">
      <h3>Line items and receipt evidence</h3>
      <div className="receipt-review">
        {claim.lineItems.map((line) => (
          <div className="approval-line-row" key={line.lineItemId}>
            <div>
              <strong>{line.description}</strong>
              <p className="muted">
                {line.transactionDate} | {expenseTagLabel(line.expenseTag)} | {line.vendorName ?? "No vendor"}
              </p>
              <p className="muted">{invoiceReferenceLabel(line.clientInvoiceNumber, line.vendorInvoiceNumber)}</p>
            </div>
            <div>
              <strong>Rs {line.amount.toLocaleString("en-IN")}</strong>
              <p className="muted">{line.paymentMode ?? "No payment mode"} | Finance: {line.financeReviewStatus}</p>
            </div>
            <span className={`badge ${line.missingReceiptFlag || line.attachments.length === 0 ? "warning" : "success"}`}>
              {line.missingReceiptFlag || line.attachments.length === 0 ? "Missing receipt" : `${line.attachments.length} receipt(s)`}
            </span>
            <div className="receipt-evidence-list">
              {line.attachments.map((attachment) => (
                <button className="receipt-evidence-button" disabled={busyAction === `download:${attachment.attachmentId}`} key={attachment.attachmentId} onClick={() => onOpenReceipt(line.lineItemId, attachment.attachmentId)} type="button">
                  {busyAction === `download:${attachment.attachmentId}` ? <Loader2 size={16} /> : <Paperclip size={16} />}
                  <span>
                    <strong>{attachment.originalFileName}</strong>
                    <small>
                      {formatBytes(attachment.fileSizeBytes)} | uploaded by {attachment.uploadedByName} | {formatTimestamp(attachment.uploadedAt)}
                    </small>
                    <small>Hash {attachment.contentHash.slice(0, 12)}{duplicateHashes.has(attachment.contentHash) ? " | duplicate hash" : ""}</small>
                  </span>
                </button>
              ))}
              {line.attachments.length === 0 ? <span className="muted">No receipt uploaded for this line.</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AuditTrailSection({ entries }: { entries: WorkspaceData["auditTrail"] }) {
  return (
    <section className="workspace-section">
      <h3>Audit trail</h3>
      <div className="workspace-thread">
        {entries.map((entry) => (
          <div className="workspace-thread-item" key={entry.auditId}>
            <FileText size={16} />
            <div>
              <strong>{entry.actionType}</strong>
              <p className="muted">{entry.actorName ?? entry.actorUserId} | {formatTimestamp(entry.actionTimestamp)}</p>
              <p>{entry.auditRemarks ?? `${entry.preActionStatus ?? "N/A"} -> ${entry.postActionStatus}`}</p>
            </div>
          </div>
        ))}
        {entries.length === 0 ? <span className="muted">No audit trail entries found.</span> : null}
      </div>
    </section>
  );
}

function CommentsSection({
  busyAction,
  comment,
  comments,
  onChange,
  onSubmit
}: {
  busyAction: string | null;
  comment: string;
  comments: WorkspaceData["comments"];
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="workspace-section">
      <h3>Comments and remarks</h3>
      <div className="workspace-thread">
        {comments.map((item) => (
          <div className="workspace-thread-item" key={item.id}>
            <MessageSquare size={16} />
            <div>
              <strong>{item.author}</strong>
              <p className="muted">{item.source} | {formatTimestamp(item.timestamp)}</p>
              <p>{item.body}</p>
            </div>
          </div>
        ))}
        {comments.length === 0 ? <span className="muted">No comments or remarks yet.</span> : null}
      </div>
      <label>
        <span className="muted">Add claim comment</span>
        <textarea maxLength={1000} onChange={(event) => onChange(event.target.value)} placeholder="Add context for Finance, Audit, approvers, or claimant" rows={3} value={comment} />
      </label>
      <button className="button" disabled={busyAction === "comment"} onClick={onSubmit} type="button">
        {busyAction === "comment" ? <Loader2 size={16} /> : <MessageSquare size={16} />}
        Add comment
      </button>
    </section>
  );
}

async function downloadResponse(response: Response, fallbackFileName: string) {
  const blob = await response.blob();
  const contentDisposition = response.headers.get("Content-Disposition") ?? "";
  const fileName = contentDisposition.match(/filename="([^"]+)"/)?.[1] ?? fallbackFileName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function invoiceReferenceLabel(clientInvoiceNumber: string | null, vendorInvoiceNumber: string | null) {
  const references = [
    clientInvoiceNumber ? `Client ${clientInvoiceNumber}` : null,
    vendorInvoiceNumber ? `Vendor ${vendorInvoiceNumber}` : null
  ].filter(Boolean);
  return references.length > 0 ? references.join(" | ") : "No invoice reference";
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
