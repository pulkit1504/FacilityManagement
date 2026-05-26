"use client";

import { useMemo, useState } from "react";
import { Check, Paperclip, Plus, RotateCcw, Send } from "lucide-react";

type ExpenseTag = "AlreadyBilled" | "PendingBilling" | "ContractPartCost" | "BackendCTC";

type LineItemDraft = {
  description: string;
  amount: string;
  transactionDate: string;
  expenseTag: ExpenseTag;
  clientInvoiceNumber: string;
  siteId: string;
};

type SavedLineItem = {
  lineItemId: string;
  description: string;
  amount: number;
  transactionDate: string;
  expenseTag: ExpenseTag;
  missingReceiptFlag: boolean;
  attachmentHash?: string;
};

type SubmissionResult = {
  assignedTo: string;
  message: string;
};

type ProblemResponse = {
  detail?: string;
  errors?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
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
  const [submissionMode, setSubmissionMode] = useState<"SingleVoucher" | "Proforma">("SingleVoucher");
  const [siteId, setSiteId] = useState("site-ansal-a");
  const [proformaPeriodStart, setProformaPeriodStart] = useState("");
  const [proformaPeriodEnd, setProformaPeriodEnd] = useState("");
  const [lineItem, setLineItem] = useState<LineItemDraft>(emptyLineItem);
  const [savedLineItems, setSavedLineItems] = useState<SavedLineItem[]>([]);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null);
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const requiresInvoice = lineItem.expenseTag === "AlreadyBilled";
  const requiresSite = lineItem.expenseTag === "ContractPartCost";
  const requiresProformaPeriod = submissionMode === "Proforma";
  const hasValidProformaPeriod =
    !requiresProformaPeriod || Boolean(proformaPeriodStart && proformaPeriodEnd && proformaPeriodEnd > proformaPeriodStart);
  const canCreateDraft = Boolean(siteId) && hasValidProformaPeriod;

  const canAddLine = useMemo(() => {
    if (!lineItem.description || !lineItem.amount || Number(lineItem.amount) <= 0) return false;
    if (requiresInvoice && !lineItem.clientInvoiceNumber) return false;
    if (requiresSite && !lineItem.siteId) return false;
    return true;
  }, [lineItem, requiresInvoice, requiresSite]);

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
          proformaPeriodStart: requiresProformaPeriod ? proformaPeriodStart : null,
          proformaPeriodEnd: requiresProformaPeriod ? proformaPeriodEnd : null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getProblemMessage(data, "Could not create claim."));
      setClaimId(data.claimId);
      if (requiresProformaPeriod) {
        setLineItem((current) => ({ ...current, transactionDate: proformaPeriodStart }));
      }
      setMessage("Draft created. Add itemized line details next.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create claim.");
    } finally {
      setBusy(false);
    }
  }

  function resetDraft() {
    setClaimId(null);
    setLineItem(emptyLineItem);
    setSavedLineItems([]);
    setSubmissionResult(null);
    setMessage("Draft cleared. Choose the entry method and create a new draft.");
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
          description: lineItem.description,
          amount: Number(lineItem.amount),
          transactionDate: lineItem.transactionDate,
          expenseTag: lineItem.expenseTag,
          clientInvoiceNumber: requiresInvoice ? lineItem.clientInvoiceNumber : null,
          siteId: requiresSite ? lineItem.siteId : null,
          sortOrder: savedLineItems.length
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not add line item.");

      setSavedLineItems((current) => [
        ...current,
        {
          lineItemId: data.lineItemId,
          description: lineItem.description,
          amount: Number(lineItem.amount),
          transactionDate: lineItem.transactionDate,
          expenseTag: lineItem.expenseTag,
          missingReceiptFlag: true
        }
      ]);
      setLineItem(emptyLineItem);
      setMessage("Line item saved. Attach a receipt from the saved line below.");
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
      setSubmissionResult({
        assignedTo: data.assignedTo,
        message: data.message
      });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit claim.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadReceipt(lineItemId: string, file: File | undefined) {
    if (!claimId || !file || submissionResult) return;
    setBusy(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/v1/claims/${claimId}/line-items/${lineItemId}/attachments`, {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not upload receipt.");
      setSavedLineItems((current) =>
        current.map((item) =>
          item.lineItemId === lineItemId
            ? { ...item, missingReceiptFlag: false, attachmentHash: data.contentHash.slice(0, 12) }
            : item
        )
      );
      setMessage("Receipt attached. This line will not show as missing to approvers.");
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
            <select disabled={Boolean(claimId)} value={submissionMode} onChange={(event) => setSubmissionMode(event.target.value as typeof submissionMode)}>
              <option value="SingleVoucher">Single Voucher</option>
              <option value="Proforma">Periodic Proforma</option>
            </select>
          </label>
          <label>
            <span className="muted">Site</span>
            <select disabled={Boolean(claimId)} value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              <option value="site-ansal-a">Ansal Heights Block A</option>
            </select>
          </label>
          {requiresProformaPeriod ? (
            <>
              <label>
                <span className="muted">Period start</span>
                <input
                  disabled={Boolean(claimId)}
                  max={proformaPeriodEnd || undefined}
                  onChange={(event) => setProformaPeriodStart(event.target.value)}
                  type="date"
                  value={proformaPeriodStart}
                />
              </label>
              <label>
                <span className="muted">Period end</span>
                <input
                  disabled={Boolean(claimId)}
                  min={proformaPeriodStart || undefined}
                  onChange={(event) => setProformaPeriodEnd(event.target.value)}
                  type="date"
                  value={proformaPeriodEnd}
                />
              </label>
            </>
          ) : null}
          <div className="actions" style={{ alignItems: "end" }}>
            <button className="button" disabled={busy || Boolean(claimId) || !canCreateDraft} onClick={createDraft} type="button">
              <Check size={18} />
              {claimId ? "Draft ready" : "Create draft"}
            </button>
            {claimId && !submissionResult ? (
              <button className="button secondary" disabled={busy} onClick={resetDraft} type="button">
                <RotateCcw size={18} />
              Cancel draft
              </button>
            ) : null}
          </div>
        </div>
        {requiresProformaPeriod && !claimId && !hasValidProformaPeriod ? (
          <p className="muted" style={{ marginTop: 12 }}>
            Select a valid proforma period before creating the draft.
          </p>
        ) : null}
        {claimId ? <p className="muted" style={{ marginTop: 12 }}>Draft ID: {claimId}</p> : null}
      </section>

      {claimId ? (
        <>
          {submissionResult ? (
            <section className="panel success-panel">
              <div className="success-icon">
                <Check size={22} />
              </div>
              <div>
                <h2>Claim Submitted</h2>
                <p>{submissionResult.message}</p>
                <p className="muted">Assigned to {submissionResult.assignedTo}. This claim is locked while it is under approval.</p>
              </div>
            </section>
          ) : null}

          {!submissionResult ? (
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
                <input
                  max={requiresProformaPeriod ? proformaPeriodEnd : undefined}
                  min={requiresProformaPeriod ? proformaPeriodStart : undefined}
                  onChange={(event) => setLineItem({ ...lineItem, transactionDate: event.target.value })}
                  type="date"
                  value={lineItem.transactionDate}
                />
              </label>
              <label>
                <span className="muted">Expense tag</span>
                <select
                  value={lineItem.expenseTag}
                  onChange={(event) =>
                    setLineItem({
                      ...lineItem,
                      expenseTag: event.target.value as ExpenseTag,
                      clientInvoiceNumber: "",
                      siteId: ""
                    })
                  }
                >
                  <option value="PendingBilling">Pending Billing</option>
                  <option value="AlreadyBilled">Already Billed</option>
                  <option value="ContractPartCost">Contract Part Cost</option>
                  <option value="BackendCTC">Backend CTC</option>
                </select>
              </label>
              {requiresInvoice ? (
                <label>
                  <span className="muted">Invoice number</span>
                  <input value={lineItem.clientInvoiceNumber} onChange={(event) => setLineItem({ ...lineItem, clientInvoiceNumber: event.target.value })} />
                </label>
              ) : null}
              {requiresSite ? (
                <label>
                  <span className="muted">Line site</span>
                  <select value={lineItem.siteId} onChange={(event) => setLineItem({ ...lineItem, siteId: event.target.value })}>
                    <option value="">Select site</option>
                    <option value="site-ansal-a">Ansal Heights Block A</option>
                  </select>
                </label>
              ) : null}
            </div>
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="button secondary" disabled={busy || !canAddLine} onClick={addLineItem} type="button">
                <Plus size={18} />
                Save line item
              </button>
            </div>
          </section>
          ) : null}

          <section className="panel">
            <div className="topbar" style={{ marginBottom: 12 }}>
              <div>
                <h2>Saved Line Items</h2>
                <p className="muted">
                  {submissionResult ? "Submitted line items are locked for approval." : "Attach receipts to each saved line before submitting."}
                </p>
              </div>
              {!submissionResult ? (
                <button className="button" disabled={busy || savedLineItems.length === 0} onClick={submitClaim} type="button">
                  <Send size={18} />
                  Submit claim
                </button>
              ) : null}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Tag</th>
                  <th>Receipt</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {savedLineItems.map((item) => (
                  <tr key={item.lineItemId}>
                    <td>{item.description}</td>
                    <td>Rs {item.amount.toLocaleString("en-IN")}</td>
                    <td>{item.expenseTag}</td>
                    <td>
                      <span className={`badge ${item.missingReceiptFlag ? "warning" : "success"}`}>
                        {item.missingReceiptFlag ? "Missing" : `Attached ${item.attachmentHash ?? ""}`}
                      </span>
                    </td>
                    <td>
                      {submissionResult ? (
                        <span className="muted">Locked</span>
                      ) : (
                        <label className={`button secondary ${busy ? "disabled-label" : ""}`}>
                          <Paperclip size={18} />
                          {item.missingReceiptFlag ? "Attach" : "Replace"}
                          <input
                            accept="image/jpeg,image/png,image/heic,application/pdf"
                            capture="environment"
                            disabled={busy}
                            hidden
                            onChange={(event) => void uploadReceipt(item.lineItemId, event.target.files?.[0])}
                            type="file"
                          />
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
                {savedLineItems.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No line items saved yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}

function getProblemMessage(data: ProblemResponse, fallback: string) {
  const formError = data.errors?.formErrors?.[0];
  if (formError) return formError;

  const fieldErrors = data.errors?.fieldErrors;
  const fieldError = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
  return fieldError ?? data.detail ?? fallback;
}
