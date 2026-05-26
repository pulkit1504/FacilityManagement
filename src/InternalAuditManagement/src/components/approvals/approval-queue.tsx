"use client";

import { Fragment, useEffect, useState } from "react";
import { Check, Eye, Loader2, RotateCcw } from "lucide-react";

type ApprovalItem = {
  claimId: string;
  submittedBy: string;
  siteName: string | null;
  totalAmount: number;
  lineItemCount: number;
  missingReceiptCount: number;
  daysPending: number;
  urgencyLevel: "Normal" | "Attention" | "Overdue";
};

type ApprovalClaimDetail = {
  lineItems: Array<{
    lineItemId: string;
    description: string;
    amount: number;
    transactionDate: string;
    expenseTag: string;
    clientInvoiceNumber: string | null;
    siteId: string | null;
    missingReceiptFlag: boolean;
    attachments: Array<{
      attachmentId: string;
      originalFileName: string;
    }>;
  }>;
};

export function ApprovalQueue() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);
  const [claimDetails, setClaimDetails] = useState<Record<string, ApprovalClaimDetail>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/v1/approvals/queue");
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.detail ?? "Could not load approval queue.");
        return;
      }
      setItems(data.items ?? []);
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
    if (claimDetails[claimId]) return;

    setBusyAction(`details:${claimId}`);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not load claim details.");
      setClaimDetails((current) => ({ ...current, [claimId]: data }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load claim details.");
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

  async function decide(claimId: string, action: "approve" | "reject") {
    setBusyAction(`${action}:${claimId}`);
    setMessage(action === "approve" ? "Approving claim..." : "Returning claim...");
    try {
      const response = await fetch(`/api/v1/approvals/${claimId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "approve" ? JSON.stringify({ remarks: "" }) : JSON.stringify({ reason: "Returned for correction." })
      });
      const data = await response.json();
      setMessage(data.message ?? data.detail ?? "Action completed.");
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="panel">
      <h2>Pending Approval Queue</h2>
      {message ? <p className="muted">{message}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Claim</th>
            <th>Site</th>
            <th>Amount</th>
            <th>Receipts</th>
            <th>Age</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={6}>
                <span className="loading-inline">
                  <Loader2 size={16} />
                  Loading approval queue...
                </span>
              </td>
            </tr>
          ) : null}
          {!isLoading && items.map((item) => (
            <Fragment key={item.claimId}>
              <tr>
                <td>
                  <strong>{item.claimId.slice(0, 8)}</strong>
                  <br />
                  <span className="muted">{item.submittedBy}</span>
                </td>
                <td>{item.siteName ?? "Not linked"}</td>
                <td>
                  Rs {item.totalAmount.toLocaleString("en-IN")}
                  <br />
                  <span className="muted">{item.lineItemCount} line items</span>
                </td>
                <td>
                  <span className={`badge ${item.missingReceiptCount > 0 ? "warning" : "success"}`}>
                    {item.missingReceiptCount > 0 ? `${item.missingReceiptCount} missing` : "All attached"}
                  </span>
                </td>
                <td>
                  <span className={`badge ${item.urgencyLevel === "Overdue" ? "danger" : item.urgencyLevel === "Attention" ? "warning" : "success"}`}>
                    {item.daysPending} days
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void toggleDetails(item.claimId)} type="button">
                      {busyAction === `details:${item.claimId}` ? <Loader2 size={16} /> : <Eye size={16} />}
                      {expandedClaimId === item.claimId ? "Hide details" : "View details"}
                    </button>
                    <button className="button" disabled={Boolean(busyAction)} onClick={() => void decide(item.claimId, "approve")} type="button">
                      {busyAction === `approve:${item.claimId}` ? <Loader2 size={16} /> : <Check size={16} />}
                      {busyAction === `approve:${item.claimId}` ? "Approving..." : "Approve"}
                    </button>
                    <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => void decide(item.claimId, "reject")} type="button">
                      {busyAction === `reject:${item.claimId}` ? <Loader2 size={16} /> : <RotateCcw size={16} />}
                      {busyAction === `reject:${item.claimId}` ? "Returning..." : "Return"}
                    </button>
                  </div>
                </td>
              </tr>
              {expandedClaimId === item.claimId ? (
                <tr>
                  <td colSpan={6}>
                    <div className="receipt-review">
                      {(claimDetails[item.claimId]?.lineItems ?? []).map((line) => (
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
                            <span className="muted">
                              {line.clientInvoiceNumber ? `Invoice ${line.clientInvoiceNumber}` : line.siteId ? `Site ${line.siteId}` : "No extra reference"}
                            </span>
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
          {!isLoading && items.length === 0 ? (
            <tr>
              <td colSpan={6}>No pending approvals.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
