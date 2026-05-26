"use client";

import { useEffect, useState } from "react";
import { Banknote, ClipboardCheck, Eye, Loader2 } from "lucide-react";

type FinanceItem = {
  claimId: string;
  submittedBy: string;
  siteName: string | null;
  totalAmount: number;
  physicalReceiptConfirmed: boolean;
  pendingBillingItemCount: number;
};

type ClaimReceiptDetail = {
  lineItems: Array<{
    lineItemId: string;
    description: string;
    amount: number;
    missingReceiptFlag: boolean;
    attachments: Array<{
      attachmentId: string;
      originalFileName: string;
      fileSizeBytes: number;
      uploadedAt: string;
    }>;
  }>;
};

export function FinanceQueue() {
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);
  const [claimDetails, setClaimDetails] = useState<Record<string, ClaimReceiptDetail>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/v1/finance/queue");
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.detail ?? "Could not load finance queue.");
      return;
    }
    setItems(data.items ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

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
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Receipt confirmation failed.");
    } finally {
      setBusyAction(null);
    }
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

  return (
    <section className="panel">
      <h2>Finance Queue</h2>
      {message ? <p className="muted">{message}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Claim</th>
            <th>Amount</th>
            <th>Receipt gate</th>
            <th>Billing</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <>
              <tr key={item.claimId}>
                <td>
                  <strong>{item.claimId.slice(0, 8)}</strong>
                  <br />
                  <span className="muted">{item.submittedBy}</span>
                </td>
                <td>Rs {item.totalAmount.toLocaleString("en-IN")}</td>
                <td>
                  <span className={`badge ${item.physicalReceiptConfirmed ? "success" : "warning"}`}>
                    {item.physicalReceiptConfirmed ? "Confirmed" : "Pending"}
                  </span>
                </td>
                <td>{item.pendingBillingItemCount} pending billing items</td>
                <td>
                  <div className="actions">
                    <button className="button secondary" onClick={() => void toggleReceipts(item.claimId)} type="button">
                      {busyAction === `receipts:${item.claimId}` ? <Loader2 size={16} /> : <Eye size={16} />}
                      {expandedClaimId === item.claimId ? "Hide receipts" : "View receipts"}
                    </button>
                    <button
                      className="button secondary"
                      disabled={item.physicalReceiptConfirmed || busyAction === `confirm:${item.claimId}`}
                      onClick={() => void confirmReceipt(item.claimId)}
                      type="button"
                    >
                      {busyAction === `confirm:${item.claimId}` ? <Loader2 size={16} /> : <ClipboardCheck size={16} />}
                      {item.physicalReceiptConfirmed ? "Receipt confirmed" : "Confirm receipt"}
                    </button>
                    <button
                      className="button"
                      disabled={busyAction === `release:${item.claimId}`}
                      onClick={() => void releasePayment(item.claimId)}
                      type="button"
                    >
                      {busyAction === `release:${item.claimId}` ? <Loader2 size={16} /> : <Banknote size={16} />}
                      Release
                    </button>
                  </div>
                </td>
              </tr>
              {expandedClaimId === item.claimId ? (
                <tr key={`${item.claimId}-receipts`}>
                  <td colSpan={5}>
                    <div className="receipt-review">
                      {(claimDetails[item.claimId]?.lineItems ?? []).map((line) => (
                        <div className="receipt-row" key={line.lineItemId}>
                          <div>
                            <strong>{line.description}</strong>
                            <br />
                            <span className="muted">Rs {line.amount.toLocaleString("en-IN")}</span>
                          </div>
                          <span className={`badge ${line.missingReceiptFlag ? "warning" : "success"}`}>
                            {line.missingReceiptFlag ? "Missing receipt" : "Receipt attached"}
                          </span>
                          <div className="actions">
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
            </>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={5}>No finance items pending.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
