"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";

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

export function ApprovalQueue() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
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
            <tr key={item.claimId}>
              <td>
                <strong>{item.claimId.slice(0, 8)}</strong>
                <br />
                <span className="muted">{item.submittedBy}</span>
              </td>
              <td>{item.siteName ?? "Not linked"}</td>
              <td>Rs {item.totalAmount.toLocaleString("en-IN")}</td>
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
