"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Eye, Loader2, RotateCcw, X } from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { getProblemMessage } from "@/components/ui/problem-message";

type ApprovalItem = {
  claimId: string;
  submittedBy: string;
  siteName: string | null;
  totalAmount: number;
  advanceAdjustmentAmount: number;
  finalPayableAmount: number;
  netAdvanceLeftAmount: number;
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

type SiteOption = {
  siteId: string;
  siteName: string;
};

export function ApprovalQueue() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);
  const [claimDetails, setClaimDetails] = useState<Record<string, ApprovalClaimDetail>>({});
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [returnClaim, setReturnClaim] = useState<ApprovalItem | null>(null);
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnError, setReturnError] = useState("");
  const returnDialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const closeReturnDialog = useCallback(() => {
    setReturnClaim(null);
    setReturnRemarks("");
    setReturnError("");
  }, []);

  async function load() {
    try {
      const [queueResponse, sitesResponse] = await Promise.all([
        fetch("/api/v1/approvals/queue"),
        fetch("/api/v1/sites", { cache: "no-store" })
      ]);
      const data = await queueResponse.json();
      const sitesData = await sitesResponse.json();
      if (!queueResponse.ok) {
        setMessage(getProblemMessage(data, "Could not load approval queue."));
        return;
      }
      if (sitesResponse.ok) {
        setSites(sitesData.items ?? []);
      }
      setItems(data.items ?? []);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!returnClaim) return;

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeReturnDialog();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = returnDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [closeReturnDialog, returnClaim]);

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

  async function approve(claimId: string) {
    setBusyAction(`approve:${claimId}`);
    setMessage("Approving claim...");
    try {
      const response = await fetch(`/api/v1/approvals/${claimId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks: "" })
      });
      const data = await response.json();
      setMessage(data.message ?? getProblemMessage(data, "Action completed."));
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  function openReturnDialog(item: ApprovalItem) {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setReturnClaim(item);
    setReturnRemarks("");
    setReturnError("");
  }

  async function submitReturn() {
    if (!returnClaim) return;

    const reason = returnRemarks.trim();
    if (reason.length < 5) {
      setReturnError("Enter a clear reason of at least 5 characters so the employee knows what to correct.");
      return;
    }

    setBusyAction(`reject:${returnClaim.claimId}`);
    try {
      const response = await fetch(`/api/v1/approvals/${returnClaim.claimId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(getProblemMessage(data, "Could not return claim."));
      setMessage(data.message ?? "Claim returned to employee.");
      setReturnClaim(null);
      setReturnRemarks("");
      setReturnError("");
      await load();
    } catch (error) {
      setReturnError(error instanceof Error ? error.message : "Could not return claim.");
    } finally {
      setBusyAction(null);
    }
  }

  function siteLabel(siteId: string | null) {
    if (!siteId) return null;
    return sites.find((site) => site.siteId === siteId)?.siteName ?? siteId;
  }

  return (
    <section aria-label="Pending approval queue table" className="panel" tabIndex={0}>
      <h2>Pending Approval Queue</h2>
      <ActionFeedback message={message} onDismiss={() => setMessage("")} />
      <table className="table">
        <thead>
          <tr>
            <th>Claim</th>
            <th>Site</th>
            <th>Settlement</th>
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
                  <strong>
                    Rs {(item.netAdvanceLeftAmount > 0 ? item.netAdvanceLeftAmount : item.finalPayableAmount).toLocaleString("en-IN")}
                  </strong>
                  <br />
                  <span className="muted">
                    {item.netAdvanceLeftAmount > 0 ? "advance left" : "payable"} from Rs {item.totalAmount.toLocaleString("en-IN")}
                    {item.advanceAdjustmentAmount > 0 ? ` less Rs ${item.advanceAdjustmentAmount.toLocaleString("en-IN")} advance` : ""}
                  </span>
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
                    <button className="button" disabled={Boolean(busyAction)} onClick={() => void approve(item.claimId)} type="button">
                      {busyAction === `approve:${item.claimId}` ? <Loader2 size={16} /> : <Check size={16} />}
                      {busyAction === `approve:${item.claimId}` ? "Approving..." : "Approve"}
                    </button>
                    <button className="button secondary" disabled={Boolean(busyAction)} onClick={() => openReturnDialog(item)} type="button">
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
                              {line.clientInvoiceNumber ? `Invoice ${line.clientInvoiceNumber}` : line.siteId ? `Site ${siteLabel(line.siteId)}` : "No extra reference"}
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

      {returnClaim ? (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeReturnDialog()}>
          <div
            aria-describedby="return-claim-description"
            aria-labelledby="return-claim-title"
            aria-modal="true"
            className="modal"
            ref={returnDialogRef}
            role="dialog"
          >
            <div className="section-heading">
              <div>
                <h2 id="return-claim-title">Return claim</h2>
                <p className="muted" id="return-claim-description">
                  Explain why this claim is being returned and what the employee needs to correct.
                </p>
              </div>
              <button aria-label="Close return dialog" className="icon-button" disabled={Boolean(busyAction)} onClick={closeReturnDialog} type="button">
                <X size={18} />
              </button>
            </div>
            <label>
              <span className="muted">Remarks / comments</span>
              <textarea
                autoFocus
                maxLength={1000}
                onChange={(event) => {
                  setReturnRemarks(event.target.value);
                  setReturnError("");
                }}
                placeholder="Describe the rejection reason and expected correction"
                required
                rows={5}
                value={returnRemarks}
              />
            </label>
            {returnError ? (
              <p className="field-error" role="alert">
                <AlertTriangle size={16} />
                {returnError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button className="button secondary" disabled={Boolean(busyAction)} onClick={closeReturnDialog} type="button">Cancel</button>
              <button className="button danger" disabled={Boolean(busyAction)} onClick={() => void submitReturn()} type="button">
                {busyAction === `reject:${returnClaim.claimId}` ? <Loader2 size={16} /> : null}
                Return to employee
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
