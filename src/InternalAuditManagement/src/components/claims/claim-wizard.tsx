"use client";

import { useMemo, useState } from "react";
import { Check, Paperclip, Plus, Send } from "lucide-react";

type LineItemDraft = {
  description: string;
  amount: string;
  transactionDate: string;
  expenseTag: "AlreadyBilled" | "PendingBilling" | "ContractPartCost" | "BackendCTC";
  clientInvoiceNumber: string;
  siteId: string;
};

const emptyLineItem: LineItemDraft = {
  description: "",
  amount: "",
  transactionDate: new Date().toISOString().slice(0, 10),
  expenseTag: "PendingBilling",
  clientInvoiceNumber: "",
  siteId: ""
};

export function ClaimWizard() {
  const [claimId, setClaimId] = useState<string | null>(null);
  const [lastLineItemId, setLastLineItemId] = useState<string | null>(null);
  const [submissionMode, setSubmissionMode] = useState<"SingleVoucher" | "Proforma">("SingleVoucher");
  const [siteId, setSiteId] = useState("site-ansal-a");
  const [lineItem, setLineItem] = useState<LineItemDraft>(emptyLineItem);
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const canAddLine = useMemo(() => {
    if (!lineItem.description || !lineItem.amount || Number(lineItem.amount) <= 0) return false;
    if (lineItem.expenseTag === "AlreadyBilled" && !lineItem.clientInvoiceNumber) return false;
    if (lineItem.expenseTag === "ContractPartCost" && !lineItem.siteId) return false;
    return true;
  }, [lineItem]);

  async function createDraft() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionMode,
          siteId,
          proformaPeriodStart: null,
          proformaPeriodEnd: null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not create claim.");
      setClaimId(data.claimId);
      setMessage("Draft created. Add line items next.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create claim.");
    } finally {
      setBusy(false);
    }
  }

  async function addLineItem() {
    if (!claimId) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...lineItem,
          amount: Number(lineItem.amount),
          clientInvoiceNumber: lineItem.clientInvoiceNumber || null,
          siteId: lineItem.siteId || null,
          sortOrder: 0
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not add line item.");
      setLastLineItemId(data.lineItemId);
      setLineItem(emptyLineItem);
      setMessage(data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add line item.");
    } finally {
      setBusy(false);
    }
  }

  async function submitClaim() {
    if (!claimId) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/submit`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not submit claim.");
      setMessage(`${data.message} Assigned to ${data.assignedTo}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit claim.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadReceipt(file: File | undefined) {
    if (!claimId || !lastLineItemId || !file) return;
    setBusy(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/v1/claims/${claimId}/line-items/${lastLineItemId}/attachments`, {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not upload receipt.");
      setMessage(`${data.message} Hash: ${data.contentHash.slice(0, 12)}...`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not upload receipt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="panel">
        <h2>Claim Details</h2>
        <div className="grid cols-3">
          <label>
            <span className="muted">Entry method</span>
            <select value={submissionMode} onChange={(event) => setSubmissionMode(event.target.value as typeof submissionMode)}>
              <option value="SingleVoucher">Single Voucher</option>
              <option value="Proforma">Periodic Proforma</option>
            </select>
          </label>
          <label>
            <span className="muted">Site</span>
            <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              <option value="site-ansal-a">Ansal Heights Block A</option>
            </select>
          </label>
          <div className="actions" style={{ alignItems: "end" }}>
            <button className="button" disabled={busy || Boolean(claimId)} onClick={createDraft} type="button">
              <Check size={18} />
              Create draft
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Add Line Item</h2>
        <div className="grid cols-3">
          <label>
            <span className="muted">Description</span>
            <input value={lineItem.description} onChange={(event) => setLineItem({ ...lineItem, description: event.target.value })} />
          </label>
          <label>
            <span className="muted">Amount</span>
            <input inputMode="decimal" value={lineItem.amount} onChange={(event) => setLineItem({ ...lineItem, amount: event.target.value })} />
          </label>
          <label>
            <span className="muted">Transaction date</span>
            <input type="date" value={lineItem.transactionDate} onChange={(event) => setLineItem({ ...lineItem, transactionDate: event.target.value })} />
          </label>
          <label>
            <span className="muted">Expense tag</span>
            <select value={lineItem.expenseTag} onChange={(event) => setLineItem({ ...lineItem, expenseTag: event.target.value as LineItemDraft["expenseTag"] })}>
              <option value="PendingBilling">Pending Billing</option>
              <option value="AlreadyBilled">Already Billed</option>
              <option value="ContractPartCost">Contract Part Cost</option>
              <option value="BackendCTC">Backend CTC</option>
            </select>
          </label>
          <label>
            <span className="muted">Invoice number</span>
            <input value={lineItem.clientInvoiceNumber} onChange={(event) => setLineItem({ ...lineItem, clientInvoiceNumber: event.target.value })} />
          </label>
          <label>
            <span className="muted">Line site</span>
            <input value={lineItem.siteId} onChange={(event) => setLineItem({ ...lineItem, siteId: event.target.value })} placeholder="Required for Contract Part Cost" />
          </label>
        </div>
        <div className="actions" style={{ marginTop: 14 }}>
          <button className="button secondary" disabled={busy || !claimId || !canAddLine} onClick={addLineItem} type="button">
            <Plus size={18} />
            Add line
          </button>
          <label className={`button secondary ${!lastLineItemId || busy ? "disabled-label" : ""}`}>
            <Paperclip size={18} />
            Attach receipt
            <input
              accept="image/jpeg,image/png,image/heic,application/pdf"
              capture="environment"
              disabled={!lastLineItemId || busy}
              hidden
              onChange={(event) => void uploadReceipt(event.target.files?.[0])}
              type="file"
            />
          </label>
          <button className="button" disabled={busy || !claimId} onClick={submitClaim} type="button">
            <Send size={18} />
            Submit
          </button>
        </div>
        {message ? <p className="muted" style={{ marginTop: 14 }}>{message}</p> : null}
      </section>
    </div>
  );
}
