"use client";

import { useEffect, useState } from "react";
import { Link2, RefreshCw } from "lucide-react";

type BillingAlertItem = {
  alertId: string;
  claimId: string;
  lineItemDescription: string;
  amount: number;
  claimantName: string;
  siteName: string | null;
  createdAt: string;
  daysOpen: number;
  escalationLevel: 0 | 1;
  alertsSentCount: number;
  urgencyLabel: string;
};

export function BillingAlerts() {
  const [items, setItems] = useState<BillingAlertItem[]>([]);
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/v1/billing/alerts?isResolved=false");
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.detail ?? "Could not load billing alerts.");
      return;
    }
    setItems(data.items ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function linkInvoice(alertId: string) {
    const clientInvoiceNumber = invoiceNumbers[alertId]?.trim();
    if (!clientInvoiceNumber) {
      setMessage("Enter an invoice number before linking.");
      return;
    }

    const response = await fetch(`/api/v1/billing/alerts/${alertId}/link-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientInvoiceNumber })
    });
    const data = await response.json();
    setMessage(data.message ?? data.detail ?? "Billing alert updated.");
    await load();
  }

  return (
    <section className="panel">
      <div className="topbar" style={{ marginBottom: 12 }}>
        <div>
          <h2>Pending Billing Alerts</h2>
          <p className="muted">Link client invoices to stop revenue leakage reminders.</p>
        </div>
        <button className="button secondary" onClick={() => void load()} type="button">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Claim</th>
            <th>Line item</th>
            <th>Amount</th>
            <th>Age</th>
            <th>Invoice</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.alertId}>
              <td>
                <strong>{item.claimId.slice(0, 8)}</strong>
                <br />
                <span className="muted">{item.siteName ?? item.claimantName}</span>
              </td>
              <td>{item.lineItemDescription}</td>
              <td>Rs {item.amount.toLocaleString("en-IN")}</td>
              <td>
                <span className={`badge ${item.daysOpen >= 7 ? "danger" : item.daysOpen >= 2 ? "warning" : "success"}`}>
                  {item.urgencyLabel}
                </span>
              </td>
              <td>
                <input
                  aria-label={`Invoice number for alert ${item.alertId}`}
                  onChange={(event) =>
                    setInvoiceNumbers((current) => ({
                      ...current,
                      [item.alertId]: event.target.value
                    }))
                  }
                  placeholder="INV-2026-0001"
                  value={invoiceNumbers[item.alertId] ?? ""}
                />
              </td>
              <td>
                <button className="button" onClick={() => void linkInvoice(item.alertId)} type="button">
                  <Link2 size={16} />
                  Link
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={6}>No active billing alerts.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
