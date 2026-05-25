"use client";

import { useEffect, useState } from "react";
import { Banknote, ClipboardCheck } from "lucide-react";

type FinanceItem = {
  claimId: string;
  submittedBy: string;
  siteName: string | null;
  totalAmount: number;
  physicalReceiptConfirmed: boolean;
  pendingBillingItemCount: number;
};

export function FinanceQueue() {
  const [items, setItems] = useState<FinanceItem[]>([]);
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

  async function confirmReceipt(claimId: string) {
    const now = new Date();
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
    setMessage(data.message ?? data.detail ?? "Receipt updated.");
    await load();
  }

  async function releasePayment(claimId: string) {
    const response = await fetch(`/api/v1/finance/${claimId}/release-payment`, { method: "POST" });
    const data = await response.json();
    setMessage(data.message ?? data.detail ?? "Payment action completed.");
    await load();
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
                  <button className="button secondary" onClick={() => void confirmReceipt(item.claimId)} type="button">
                    <ClipboardCheck size={16} />
                    Confirm receipt
                  </button>
                  <button className="button" onClick={() => void releasePayment(item.claimId)} type="button">
                    <Banknote size={16} />
                    Release
                  </button>
                </div>
              </td>
            </tr>
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
