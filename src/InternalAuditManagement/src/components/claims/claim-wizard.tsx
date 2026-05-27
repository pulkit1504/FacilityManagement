"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Paperclip, Plus, RotateCcw, Send } from "lucide-react";

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

type LoadedClaim = {
  claimId: string;
  submissionMode: "SingleVoucher" | "Proforma";
  proformaPeriodStart: string | null;
  proformaPeriodEnd: string | null;
  status: string;
  statusLabel: string;
  siteId: string | null;
  rejectionReason: string | null;
  lineItems: Array<SavedLineItem & { attachments: Array<{ contentHash: string }> }>;
};

type SubmissionResult = {
  assignedTo: string;
  message: string;
};

type ProblemResponse = {
  detail?: string;
  errors?:
    | string[]
    | {
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

export function ClaimWizard({ initialClaimId }: Readonly<{ initialClaimId?: string }>) {
  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [submissionMode, setSubmissionMode] = useState<"SingleVoucher" | "Proforma">("SingleVoucher");
  const [siteId, setSiteId] = useState("site-ansal-a");
  const [proformaPeriodStart, setProformaPeriodStart] = useState("");
  const [proformaPeriodEnd, setProformaPeriodEnd] = useState("");
  const [lineItem, setLineItem] = useState<LineItemDraft>(emptyLineItem);
  const [savedLineItems, setSavedLineItems] = useState<SavedLineItem[]>([]);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null);
  const [message, setMessage] = useState<string>("");
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [isLoadingClaim, setIsLoadingClaim] = useState(Boolean(initialClaimId));

  const requiresInvoice = lineItem.expenseTag === "AlreadyBilled";
  const requiresSite = lineItem.expenseTag === "ContractPartCost";
  const requiresProformaPeriod = submissionMode === "Proforma";
  const hasValidProformaPeriod =
    !requiresProformaPeriod || Boolean(proformaPeriodStart && proformaPeriodEnd && proformaPeriodEnd > proformaPeriodStart);
  const canCreateDraft = Boolean(siteId) && hasValidProformaPeriod;
  const submitGateMessages = useMemo(() => {
    if (requiresProformaPeriod && savedLineItems.length < 2) {
      return ["Periodic proforma requires at least two saved line items before submission."];
    }

    if (savedLineItems.length === 0) {
      return ["Add at least one saved line item before submitting the claim."];
    }

    return [];
  }, [requiresProformaPeriod, savedLineItems.length]);
  const canSubmitClaim = submitGateMessages.length === 0;
  const isReturned = claimStatus === "Rejected";
  const isDraft = !claimStatus || claimStatus === "Draft";

  const canAddLine = useMemo(() => {
    if (!lineItem.description || !lineItem.amount || Number(lineItem.amount) <= 0) return false;
    if (requiresInvoice && !lineItem.clientInvoiceNumber) return false;
    if (requiresSite && !lineItem.siteId) return false;
    return true;
  }, [lineItem, requiresInvoice, requiresSite]);

  useEffect(() => {
    if (!initialClaimId) return;

    async function loadClaim() {
      setIsLoadingClaim(true);
      setMessage("");
      setErrorMessages([]);
      try {
        const response = await fetch(`/api/v1/claims/${initialClaimId}`);
        const data = (await response.json()) as LoadedClaim & ProblemResponse;
        if (!response.ok) {
          setErrorMessages(getProblemMessages(data, "Could not load claim."));
          return;
        }

        setClaimId(data.claimId);
        setClaimStatus(data.status);
        setRejectionReason(data.rejectionReason);
        setSubmissionMode(data.submissionMode);
        setSiteId(data.siteId ?? "site-ansal-a");
        setProformaPeriodStart(data.proformaPeriodStart ?? "");
        setProformaPeriodEnd(data.proformaPeriodEnd ?? "");
        setSavedLineItems(
          data.lineItems.map((item) => ({
            lineItemId: item.lineItemId,
            description: item.description,
            amount: item.amount,
            transactionDate: item.transactionDate,
            expenseTag: item.expenseTag,
            missingReceiptFlag: item.missingReceiptFlag,
            attachmentHash: item.attachments[0]?.contentHash?.slice(0, 12)
          }))
        );
        setLineItem((current) => ({
          ...current,
          transactionDate: data.proformaPeriodStart ?? current.transactionDate
        }));
      } finally {
        setIsLoadingClaim(false);
      }
    }

    void loadClaim();
  }, [initialClaimId]);

  async function createDraft() {
    setBusy(true);
    setMessage("");
    setErrorMessages([]);
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
      if (!response.ok) {
        setErrorMessages(getProblemMessages(data, "Could not create claim."));
        return;
      }
      setClaimId(data.claimId);
      setClaimStatus("Draft");
      setRejectionReason(null);
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
    setClaimStatus(null);
    setRejectionReason(null);
    setLineItem(emptyLineItem);
    setSavedLineItems([]);
    setSubmissionResult(null);
    setErrorMessages([]);
    setMessage("Draft cleared. Choose the entry method and create a new draft.");
  }

  async function addLineItem() {
    if (!claimId || !isDraft) return;
    setBusy(true);
    setMessage("");
    setErrorMessages([]);
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
      if (!response.ok) {
        setErrorMessages(getProblemMessages(data, "Could not add line item."));
        return;
      }

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
    if (!claimId || !isDraft) return;
    setBusy(true);
    setMessage("");
    setErrorMessages([]);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/submit`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessages(getProblemMessages(data, "Could not submit claim."));
        return;
      }
      setSubmissionResult({
        assignedTo: data.assignedTo,
        message: data.message
      });
      setClaimStatus(data.status);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit claim.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadReceipt(lineItemId: string, file: File | undefined) {
    if (!claimId || !file || submissionResult || !isDraft) return;
    setBusy(true);
    setMessage("");
    setErrorMessages([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/v1/claims/${claimId}/line-items/${lineItemId}/attachments`, {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessages(getProblemMessages(data, "Could not upload receipt."));
        return;
      }
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

  async function reopenReturnedClaim() {
    if (!claimId) return;
    setBusy(true);
    setMessage("");
    setErrorMessages([]);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/reopen`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessages(getProblemMessages(data, "Could not reopen claim."));
        return;
      }
      setClaimStatus("Draft");
      setRejectionReason(null);
      setMessage(data.message ?? "Claim reopened for correction.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reopen claim.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoadingClaim) {
    return (
      <section className="panel">
        <span className="loading-inline">
          <Loader2 size={16} />
          Loading claim...
        </span>
      </section>
    );
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
            {claimId && !submissionResult && !initialClaimId ? (
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
        {isReturned ? (
          <div className="return-panel" style={{ marginTop: 12 }}>
            <strong>Returned for correction</strong>
            <p>{rejectionReason ?? "Review the claim details and reopen it before making changes."}</p>
            <button className="button" disabled={busy} onClick={() => void reopenReturnedClaim()} type="button">
              <RotateCcw size={18} />
              Reopen for correction
            </button>
          </div>
        ) : null}
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

          {!submissionResult && isDraft ? (
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
              {!submissionResult && isDraft ? (
                <div className="grid" style={{ gap: 8, justifyItems: "end" }}>
                  <button className="button" disabled={busy || !canSubmitClaim} onClick={submitClaim} type="button">
                    <Send size={18} />
                    Submit claim
                  </button>
                  {submitGateMessages.length > 0 ? (
                    <p className="muted" style={{ margin: 0, maxWidth: 360, textAlign: "right" }}>
                      {submitGateMessages[0]}
                    </p>
                  ) : null}
                </div>
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

      {errorMessages.length > 0 ? (
        <section
          aria-live="polite"
          className="panel"
          role="alert"
          style={{ borderColor: "#fecaca", boxShadow: "none" }}
        >
          <h2 style={{ color: "var(--danger)", fontSize: 18 }}>Action needed</h2>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {errorMessages.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}

function getProblemMessages(data: ProblemResponse, fallback: string): string[] {
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors;
  }

  const formErrors = !Array.isArray(data.errors) ? data.errors?.formErrors : undefined;
  if (formErrors?.length) return formErrors;

  const fieldErrors = !Array.isArray(data.errors) ? data.errors?.fieldErrors : undefined;
  const fieldErrorMessages = fieldErrors ? Object.values(fieldErrors).flat().filter((error): error is string => Boolean(error)) : [];
  if (fieldErrorMessages.length > 0) return fieldErrorMessages;

  return [data.detail ?? fallback];
}
