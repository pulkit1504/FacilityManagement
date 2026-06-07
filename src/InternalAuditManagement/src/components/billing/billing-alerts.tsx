"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, RefreshCw } from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { getProblemMessage } from "@/components/ui/problem-message";

type BillingAlertItem = {
  alertId: string;
  claimId: string;
  lineItemDescription: string;
  amount: number;
  billableAmount: number;
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
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/v1/billing/alerts?isResolved=false");
      const data = await response.json();
      if (!response.ok) {
        setMessage(getProblemMessage(data, "Could not load billing alerts."));
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setMessage("Could not load billing alerts. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
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

    setBusyAction(`link:${alertId}`);
    setMessage("Linking invoice...");
    try {
      const response = await fetch(`/api/v1/billing/alerts/${alertId}/link-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientInvoiceNumber })
      });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, "Billing alert updated."));
      if (response.ok) {
        setInvoiceNumbers((current) => ({ ...current, [alertId]: "" }));
        await load();
      }
    } catch {
      setMessage("Could not link the invoice. Check your connection and try again.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="panel">
      <div className="topbar" style={{ marginBottom: 12 }}>
        <div>
          <h2>Pending Billing Alerts</h2>
          <p className="muted">Link client invoices to stop revenue leakage reminders.</p>
        </div>
        <button className="button secondary" disabled={isLoading} onClick={() => void load()} type="button">
          {isLoading ? <Loader2 size={16} /> : <RefreshCw size={16} />}
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>
      <ActionFeedback message={message} onDismiss={() => setMessage("")} />
      <table className="table">
        <thead>
          <tr>
            <th>Claim</th>
            <th>Line item</th>
            <th>Expense / billable</th>
            <th>Age</th>
            <th>Invoice</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={6}>
                <span className="loading-inline">
                  <Loader2 size={16} />
                  Loading billing alerts...
                </span>
              </td>
            </tr>
          ) : null}
          {!isLoading && items.map((item) => (
            <tr key={item.alertId}>
              <td>
                <strong>{item.claimId.slice(0, 8)}</strong>
                <br />
                <span className="muted">{item.siteName ?? item.claimantName}</span>
              </td>
              <td>{item.lineItemDescription}</td>
              <td>
                <strong>Rs {item.amount.toLocaleString("en-IN")}</strong>
                <br />
                <span className="muted">Bill Rs {item.billableAmount.toLocaleString("en-IN")}</span>
              </td>
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
                <button className="button" disabled={Boolean(busyAction)} onClick={() => void linkInvoice(item.alertId)} type="button">
                  {busyAction === `link:${item.alertId}` ? <Loader2 size={16} /> : <Link2 size={16} />}
                  {busyAction === `link:${item.alertId}` ? "Linking..." : "Link"}
                </button>
              </td>
            </tr>
          ))}
          {!isLoading && items.length === 0 ? (
            <tr>
              <td colSpan={6}>No active billing alerts.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
