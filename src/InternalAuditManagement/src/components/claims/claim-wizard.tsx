"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Paperclip, Pencil, Plus, RotateCcw, Send, Trash2, X } from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { expenseTagLabel } from "@/shared/expense-tags";
import { calculateSelectedSettlementAmounts } from "@/shared/settlement";

type ExpenseTag = "AlreadyBilled" | "PendingBilling" | "ContractPartCost" | "BackendCTC";
type PaymentMode = "Cash" | "UPI";

type LineItemDraft = {
  expenseHead: string;
  description: string;
  amount: string;
  transactionDate: string;
  paymentMode: PaymentMode;
  expenseTag: ExpenseTag;
  clientInvoiceNumber: string;
  vendorInvoiceNumber: string;
  vendorName: string;
  billableAmount: string;
  siteOrDepartment: string;
  siteId: string;
};

type SiteOption = {
  siteId: string;
  siteName: string;
  clientName: string | null;
  siteAddress: string | null;
  serviceType: string;
};

type SavedLineItem = {
  lineItemId: string;
  expenseHead: string | null;
  description: string;
  amount: number;
  transactionDate: string;
  paymentMode: PaymentMode | null;
  expenseTag: ExpenseTag;
  clientInvoiceNumber: string | null;
  vendorName: string | null;
  vendorInvoiceNumber: string | null;
  billableAmount: number | null;
  siteOrDepartment: string | null;
  siteId: string | null;
  missingReceiptFlag: boolean;
  attachmentHash?: string;
};

type LoadedClaim = {
  claimId: string;
  claimKind: "Advance" | "Reimbursement";
  advanceClaimId: string | null;
  submissionMode: "SingleVoucher" | "Proforma";
  proformaPeriodStart: string | null;
  proformaPeriodEnd: string | null;
  claimPeriodMonth: string | null;
  status: string;
  statusLabel: string;
  siteId: string | null;
  rejectionReason: string | null;
  advanceAdjustmentAmount: number;
  lineItems: Array<SavedLineItem & { attachments: Array<{ contentHash: string }> }>;
};

type PendingAdvance = {
  claimId: string;
  ticketId: string;
  siteName: string | null;
  advanceAmount: number;
  settledAmount: number;
  advanceBalance: number;
  paidAt: string;
  ageDays: number;
  settlementStatus: "Open" | "Aging" | "Overdue";
  settlementStatusLabel: string;
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
  expenseHead: "",
  description: "",
  amount: "",
  transactionDate: new Date().toISOString().slice(0, 10),
  paymentMode: "Cash",
  expenseTag: "PendingBilling",
  clientInvoiceNumber: "",
  vendorInvoiceNumber: "",
  vendorName: "",
  billableAmount: "",
  siteOrDepartment: "",
  siteId: ""
};

const expenseHeadOptions = [
  "Housekeeping Consumables",
  "Cleaning Chemicals",
  "Pantry and Refreshments",
  "Repairs and Maintenance",
  "Electrical and Plumbing",
  "Security Operations",
  "Printing and Stationery",
  "Courier and Postage",
  "Travel and Conveyance",
  "Fuel and Parking",
  "Staff Welfare",
  "Uniform and PPE",
  "Waste Management",
  "Pest Control",
  "Client Rechargeable",
  "Other"
];

export function ClaimWizard({
  initialClaimId,
  initialAdvanceClaimId
}: Readonly<{ initialClaimId?: string; initialAdvanceClaimId?: string }>) {
  const [claimId, setClaimId] = useState<string | null>(null);
  const [advanceClaimId, setAdvanceClaimId] = useState(initialAdvanceClaimId ?? "");
  const [advanceAdjustmentAmount, setAdvanceAdjustmentAmount] = useState(0);
  const [pendingAdvances, setPendingAdvances] = useState<PendingAdvance[]>([]);
  const [pendingAdvancesLoaded, setPendingAdvancesLoaded] = useState(false);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [submissionMode, setSubmissionMode] = useState<"SingleVoucher" | "Proforma">("SingleVoucher");
  const [claimPeriodMonth, setClaimPeriodMonth] = useState(new Date().toISOString().slice(0, 7));
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteId, setSiteId] = useState("");
  const [proformaPeriodStart, setProformaPeriodStart] = useState("");
  const [proformaPeriodEnd, setProformaPeriodEnd] = useState("");
  const [lineItem, setLineItem] = useState<LineItemDraft>(emptyLineItem);
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(null);
  const [savedLineItems, setSavedLineItems] = useState<SavedLineItem[]>([]);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null);
  const [advanceReviewOpen, setAdvanceReviewOpen] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [isLoadingClaim, setIsLoadingClaim] = useState(Boolean(initialClaimId));
  const [isPreparingCorrection, setIsPreparingCorrection] = useState(false);
  const [autoReopenAttemptedClaimId, setAutoReopenAttemptedClaimId] = useState<string | null>(null);

  const requiresSite = lineItem.expenseTag === "ContractPartCost";
  const requiresInvoice = lineItem.expenseTag === "AlreadyBilled";
  const requiresBillableAmount = lineItem.expenseTag === "PendingBilling";
  const requiresSiteOrDepartment = lineItem.expenseTag === "ContractPartCost" || lineItem.expenseTag === "BackendCTC";
  const requiresProformaPeriod = submissionMode === "Proforma";
  const today = new Date().toISOString().slice(0, 10);
  const claimMonthStart = `${claimPeriodMonth}-01`;
  const claimMonthEnd = endOfMonth(claimPeriodMonth);
  const oldestAllowedLineDate = addUtcDays(today, requiresProformaPeriod ? -50 : -20);
  const lineDateMin = maxDate([claimMonthStart, oldestAllowedLineDate, requiresProformaPeriod ? proformaPeriodStart : null]);
  const lineDateMax = minDate([claimMonthEnd, today, requiresProformaPeriod ? proformaPeriodEnd : null]);
  const selectedAdvance = useMemo(
    () => pendingAdvances.find((advance) => advance.claimId === advanceClaimId) ?? null,
    [advanceClaimId, pendingAdvances]
  );
  const savedLineTotal = useMemo(
    () => savedLineItems.reduce((sum, item) => sum + item.amount, 0),
    [savedLineItems]
  );
  const editingLineAmount = useMemo(
    () => savedLineItems.find((item) => item.lineItemId === editingLineItemId)?.amount ?? 0,
    [editingLineItemId, savedLineItems]
  );
  const settlementDraftTotalAfterLine = savedLineTotal - editingLineAmount + (Number(lineItem.amount) || 0);
  const settlementPreview = selectedAdvance
    ? calculateSelectedSettlementAmounts(settlementDraftTotalAfterLine, selectedAdvance.advanceBalance, advanceAdjustmentAmount)
    : null;
  const savedSettlement = selectedAdvance
    ? calculateSelectedSettlementAmounts(savedLineTotal, selectedAdvance.advanceBalance, advanceAdjustmentAmount)
    : null;
  const maximumAdvanceAdjustment = selectedAdvance ? Math.min(savedLineTotal, selectedAdvance.advanceBalance) : 0;
  useEffect(() => {
    setAdvanceAdjustmentAmount((current) => Math.min(current, maximumAdvanceAdjustment));
  }, [maximumAdvanceAdjustment]);
  const hasValidProformaPeriod =
    !requiresProformaPeriod || Boolean(proformaPeriodStart && proformaPeriodEnd && proformaPeriodEnd > proformaPeriodStart);
  const canCreateDraft = Boolean(siteId && claimPeriodMonth) && hasValidProformaPeriod;
  const submitGateMessages = useMemo(() => {
    if (!pendingAdvancesLoaded) {
      return ["Wait while outstanding advances are checked before submission."];
    }

    if (editingLineItemId) {
      return ["Save or cancel the line item edit before submitting the claim."];
    }

    if (requiresProformaPeriod && savedLineItems.length < 2) {
      return ["Periodic proforma requires at least two saved line items before submission."];
    }

    if (savedLineItems.length === 0) {
      return ["Add at least one saved line item before submitting the claim."];
    }

    return [];
  }, [editingLineItemId, pendingAdvancesLoaded, requiresProformaPeriod, savedLineItems.length]);
  const canSubmitClaim = submitGateMessages.length === 0;
  const isReturned = claimStatus === "Rejected";
  const isDraft = !claimStatus || claimStatus === "Draft";

  const canAddLine = useMemo(() => {
    if (!lineItem.expenseHead) return false;
    if (!lineItem.description || !lineItem.amount || Number(lineItem.amount) <= 0) return false;
    if (!lineItem.transactionDate || lineItem.transactionDate < lineDateMin || lineItem.transactionDate > lineDateMax) return false;
    if (requiresInvoice && !lineItem.clientInvoiceNumber.trim()) return false;
    if (requiresInvoice && !lineItem.vendorInvoiceNumber.trim()) return false;
    if (requiresBillableAmount && (!lineItem.billableAmount || Number(lineItem.billableAmount) <= 0)) return false;
    if (requiresSite && !lineItem.siteId) return false;
    if (requiresSiteOrDepartment && !lineItem.siteOrDepartment) return false;
    return true;
  }, [lineDateMax, lineDateMin, lineItem, requiresBillableAmount, requiresInvoice, requiresSite, requiresSiteOrDepartment]);

  useEffect(() => {
    async function loadSites() {
      const response = await fetch("/api/v1/sites", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessages(getProblemMessages(data, "Could not load sites."));
        return;
      }

      const loadedSites = (data.items ?? []) as SiteOption[];
      setSites(loadedSites);
      setSiteId((current) => current || loadedSites[0]?.siteId || "");
    }

    void loadSites();
  }, []);

  useEffect(() => {
    async function loadPendingAdvances() {
      try {
        const response = await fetch("/api/v1/claims/advances", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          setErrorMessages(getProblemMessages(data, "Could not check outstanding advances."));
          return;
        }
        setPendingAdvances(data.items ?? []);
        setPendingAdvancesLoaded(true);
      } catch {
        setErrorMessages(["Could not check outstanding advances."]);
      }
    }

    void loadPendingAdvances();
  }, []);

  const applyLoadedClaim = useCallback((data: LoadedClaim) => {
    setClaimId(data.claimId);
    setClaimStatus(data.status);
    setAdvanceClaimId(data.advanceClaimId ?? "");
    setAdvanceAdjustmentAmount(data.advanceAdjustmentAmount ?? 0);
    setRejectionReason(data.rejectionReason);
    setSubmissionMode(data.submissionMode);
    setClaimPeriodMonth(data.claimPeriodMonth?.slice(0, 7) ?? new Date().toISOString().slice(0, 7));
    setSiteId(data.siteId ?? "");
    setProformaPeriodStart(data.proformaPeriodStart ?? "");
    setProformaPeriodEnd(data.proformaPeriodEnd ?? "");
    setSavedLineItems(
      data.lineItems.map((item) => ({
        lineItemId: item.lineItemId,
        expenseHead: item.expenseHead,
        description: item.description,
        amount: item.amount,
        transactionDate: item.transactionDate,
        paymentMode: item.paymentMode,
        expenseTag: item.expenseTag,
        clientInvoiceNumber: item.clientInvoiceNumber,
        vendorName: item.vendorName,
        vendorInvoiceNumber: item.vendorInvoiceNumber,
        billableAmount: item.billableAmount,
        siteOrDepartment: item.siteOrDepartment,
        siteId: item.siteId,
        missingReceiptFlag: item.missingReceiptFlag,
        attachmentHash: item.attachments[0]?.contentHash?.slice(0, 12)
      }))
    );
    setLineItem((current) => ({
      ...current,
      transactionDate: data.proformaPeriodStart ?? current.transactionDate
    }));
  }, []);

  const loadClaimById = useCallback(async (claimIdToLoad: string, fallbackMessage = "Could not load claim.") => {
    const response = await fetch(`/api/v1/claims/${claimIdToLoad}`, { cache: "no-store" });
    const data = (await response.json()) as LoadedClaim & ProblemResponse;
    if (!response.ok) {
      setErrorMessages(getProblemMessages(data, fallbackMessage));
      return null;
    }

    applyLoadedClaim(data);
    return data;
  }, [applyLoadedClaim]);

  useEffect(() => {
    if (!initialClaimId) return;

    async function loadClaim() {
      setIsLoadingClaim(true);
      setMessage("");
      setErrorMessages([]);
      try {
        await loadClaimById(initialClaimId!, "Could not load claim.");
      } finally {
        setIsLoadingClaim(false);
      }
    }

    void loadClaim();
  }, [initialClaimId, loadClaimById]);

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
          claimKind: "Reimbursement",
          siteId,
          claimPeriodMonth: `${claimPeriodMonth}-01`,
          advanceClaimId: null,
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
    setEditingLineItemId(null);
    setSavedLineItems([]);
    setAdvanceAdjustmentAmount(0);
    setSubmissionResult(null);
    setErrorMessages([]);
    setMessage("Draft cleared. Choose the entry method and create a new draft.");
  }

  async function saveLineItem() {
    if (!claimId || !isDraft) return;
    setBusy(true);
    setMessage("");
    setErrorMessages([]);
    try {
      const response = await fetch(
        editingLineItemId ? `/api/v1/claims/${claimId}/line-items/${editingLineItemId}` : `/api/v1/claims/${claimId}/line-items`,
        {
        method: editingLineItemId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: lineItem.description,
          amount: Number(lineItem.amount),
          transactionDate: lineItem.transactionDate,
          expenseHead: lineItem.expenseHead || null,
          paymentMode: lineItem.paymentMode,
          expenseTag: lineItem.expenseTag,
          clientInvoiceNumber: requiresInvoice ? lineItem.clientInvoiceNumber : null,
          vendorName: lineItem.vendorName || null,
          vendorInvoiceNumber: lineItem.vendorInvoiceNumber || null,
          billableAmount: requiresBillableAmount ? Number(lineItem.billableAmount) : null,
          siteOrDepartment: requiresSiteOrDepartment ? lineItem.siteOrDepartment : null,
          lineTicketId: null,
          siteId: requiresSite ? lineItem.siteId : null,
          sortOrder: savedLineItems.length
        })
        }
      );
      const data = await response.json();
      if (!response.ok) {
        setErrorMessages(getProblemMessages(data, editingLineItemId ? "Could not update line item." : "Could not add line item."));
        return;
      }

      if (editingLineItemId) {
        setSavedLineItems((current) =>
          current.map((item) =>
            item.lineItemId === editingLineItemId
              ? {
                  ...item,
                  expenseHead: lineItem.expenseHead || null,
                  description: lineItem.description,
                  amount: Number(lineItem.amount),
                  transactionDate: lineItem.transactionDate,
                  paymentMode: lineItem.paymentMode,
                  expenseTag: lineItem.expenseTag,
                  clientInvoiceNumber: requiresInvoice ? lineItem.clientInvoiceNumber : null,
                  vendorName: lineItem.vendorName || null,
                  vendorInvoiceNumber: lineItem.vendorInvoiceNumber || null,
                  billableAmount: requiresBillableAmount ? Number(lineItem.billableAmount) : null,
                  siteOrDepartment: requiresSiteOrDepartment ? lineItem.siteOrDepartment : null,
                  siteId: requiresSite ? lineItem.siteId : null
                }
              : item
          )
        );
      } else {
        setSavedLineItems((current) => [
          ...current,
          {
            lineItemId: data.lineItemId,
            expenseHead: lineItem.expenseHead || null,
            description: lineItem.description,
            amount: Number(lineItem.amount),
            transactionDate: lineItem.transactionDate,
            paymentMode: lineItem.paymentMode,
            expenseTag: lineItem.expenseTag,
            clientInvoiceNumber: requiresInvoice ? lineItem.clientInvoiceNumber : null,
            vendorName: lineItem.vendorName || null,
            vendorInvoiceNumber: lineItem.vendorInvoiceNumber || null,
            billableAmount: requiresBillableAmount ? Number(lineItem.billableAmount) : null,
            siteOrDepartment: requiresSiteOrDepartment ? lineItem.siteOrDepartment : null,
            siteId: requiresSite ? lineItem.siteId : null,
            missingReceiptFlag: true
          }
        ]);
      }
      setEditingLineItemId(null);
      setLineItem(emptyLineItem);
      setMessage(editingLineItemId ? "Line item updated." : "Line item saved. Attach a receipt from the saved line below.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save line item.");
    } finally {
      setBusy(false);
    }
  }

  function startEditLineItem(item: SavedLineItem) {
    setEditingLineItemId(item.lineItemId);
    setLineItem({
      description: item.description,
      amount: String(item.amount),
      transactionDate: item.transactionDate,
      expenseHead: item.expenseHead ?? "",
      paymentMode: item.paymentMode ?? "Cash",
      expenseTag: item.expenseTag,
      clientInvoiceNumber: item.clientInvoiceNumber ?? "",
      vendorInvoiceNumber: item.vendorInvoiceNumber ?? "",
      vendorName: item.vendorName ?? "",
      billableAmount: item.billableAmount ? String(item.billableAmount) : "",
      siteOrDepartment: item.siteOrDepartment ?? "",
      siteId: item.siteId ?? ""
    });
    setMessage("Editing saved line item. Save changes before submitting.");
  }

  function cancelEditLineItem() {
    setEditingLineItemId(null);
    setLineItem(emptyLineItem);
    setMessage("");
  }

  async function deleteLineItem(lineItemId: string) {
    if (!claimId || !isDraft) return;
    setBusy(true);
    setMessage("");
    setErrorMessages([]);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/line-items/${lineItemId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessages(getProblemMessages(data, "Could not remove line item."));
        return;
      }
      setSavedLineItems((current) => current.filter((item) => item.lineItemId !== lineItemId));
      if (editingLineItemId === lineItemId) {
        cancelEditLineItem();
      }
      setMessage(data.message ?? "Line item removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove line item.");
    } finally {
      setBusy(false);
    }
  }

  function requestSubmitClaim() {
    if (pendingAdvances.length === 0) {
      void submitClaim();
      return;
    }

    if (!advanceClaimId) {
      const firstAdvance = pendingAdvances[0];
      setAdvanceClaimId(firstAdvance.claimId);
      setAdvanceAdjustmentAmount(Math.min(savedLineTotal, firstAdvance.advanceBalance));
    }
    setAdvanceReviewOpen(true);
  }

  async function submitClaim(applyAdvance = Boolean(advanceClaimId)) {
    if (!claimId || !isDraft) return;
    setBusy(true);
    setAdvanceReviewOpen(false);
    setMessage("");
    setErrorMessages([]);
    try {
      if (applyAdvance) {
        const adjustmentResponse = await fetch(`/api/v1/claims/${claimId}/advance-adjustment`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ advanceClaimId, advanceAdjustmentAmount })
        });
        const adjustmentData = await adjustmentResponse.json();
        if (!adjustmentResponse.ok) {
          setErrorMessages(getProblemMessages(adjustmentData, "Could not save advance adjustment."));
          return;
        }
        setAdvanceClaimId(adjustmentData.advanceClaimId);
        setAdvanceAdjustmentAmount(adjustmentData.advanceAdjustmentAmount);
      }
      const response = await fetch(`/api/v1/claims/${claimId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outstandingAdvancesReviewed: pendingAdvancesLoaded })
      });
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

  async function saveAdvanceAdjustment() {
    if (!claimId || !advanceClaimId || !isDraft) return;
    setBusy(true);
    setMessage("");
    setErrorMessages([]);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/advance-adjustment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advanceClaimId, advanceAdjustmentAmount })
      });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessages(getProblemMessages(data, "Could not save advance adjustment."));
        return;
      }
      setAdvanceAdjustmentAmount(data.advanceAdjustmentAmount);
      setMessage(data.message ?? "Advance adjustment saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save advance adjustment.");
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

  const reopenReturnedClaim = useCallback(async (options: { automatic?: boolean } = {}) => {
    if (!claimId) return;
    setBusy(true);
    setIsPreparingCorrection(Boolean(options.automatic));
    setMessage("");
    setErrorMessages([]);
    try {
      const response = await fetch(`/api/v1/claims/${claimId}/reopen`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessages(getProblemMessages(data, "Could not prepare this claim for correction."));
        return;
      }
      setSubmissionResult(null);
      setEditingLineItemId(null);
      setClaimStatus(data.status ?? "Draft");
      setRejectionReason(null);
      await loadClaimById(claimId, "Claim reopened, but could not refresh the latest claim details.");
      setMessage(data.message ?? "Claim reopened for correction.");
    } catch (error) {
      setErrorMessages([error instanceof Error ? error.message : "Could not prepare this claim for correction."]);
    } finally {
      setIsPreparingCorrection(false);
      setBusy(false);
    }
  }, [claimId, loadClaimById]);

  useEffect(() => {
    if (!initialClaimId || !claimId || !isReturned || autoReopenAttemptedClaimId === claimId) return;

    setAutoReopenAttemptedClaimId(claimId);
    void reopenReturnedClaim({ automatic: true });
  }, [autoReopenAttemptedClaimId, claimId, initialClaimId, isReturned, reopenReturnedClaim]);

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
          <div>
            <span className="muted">Claim type</span>
            <p><strong>Reimbursement</strong></p>
          </div>
          <label>
            <span className="muted">Claim month</span>
            <input disabled={Boolean(claimId)} type="month" value={claimPeriodMonth} onChange={(event) => setClaimPeriodMonth(event.target.value)} />
          </label>
          <label>
            <span className="muted">Entry method</span>
            <select disabled={Boolean(claimId)} value={submissionMode} onChange={(event) => setSubmissionMode(event.target.value as typeof submissionMode)}>
              <option value="SingleVoucher">Single Voucher</option>
              <option value="Proforma">Periodic Proforma</option>
            </select>
          </label>
          <label>
            <span className="muted">Site</span>
            <select disabled={Boolean(claimId) || sites.length === 0} value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              <option value="">Select site</option>
              {sites.map((site) => (
                <option key={site.siteId} value={site.siteId}>
                  {site.siteName}{site.clientName ? ` - ${site.clientName}` : ""}
                </option>
              ))}
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
        {selectedAdvance ? (
          <div className="settlement-summary" style={{ marginTop: 12 }}>
            <div>
              <span className="muted">Advance</span>
              <strong>{selectedAdvance.ticketId}</strong>
            </div>
            <div>
              <span className="muted">Original</span>
              <strong>Rs {selectedAdvance.advanceAmount.toLocaleString("en-IN")}</strong>
            </div>
            <div>
              <span className="muted">Settled</span>
              <strong>Rs {selectedAdvance.settledAmount.toLocaleString("en-IN")}</strong>
            </div>
            <div>
              <span className="muted">Open balance</span>
              <strong>Rs {selectedAdvance.advanceBalance.toLocaleString("en-IN")}</strong>
            </div>
            <div>
              <span className="muted">Expenses entered</span>
              <strong>Rs {savedLineTotal.toLocaleString("en-IN")}</strong>
            </div>
            <div>
              <span className="muted">Advance adjusted</span>
              <strong>Rs {(savedSettlement?.advanceAdjusted ?? 0).toLocaleString("en-IN")}</strong>
            </div>
            <div>
              <span className="muted">{(savedSettlement?.finalPayable ?? 0) > 0 ? "Final payable" : "Net advance left"}</span>
              <strong>
                Rs {Math.max(savedSettlement?.finalPayable ?? 0, savedSettlement?.netAdvanceLeft ?? 0).toLocaleString("en-IN")}
              </strong>
            </div>
            <div>
              <span className="muted">Age</span>
              <span className={`badge ${selectedAdvance.settlementStatus === "Overdue" ? "danger" : selectedAdvance.settlementStatus === "Aging" ? "warning" : "success"}`}>
                {selectedAdvance.ageDays} days · {selectedAdvance.settlementStatusLabel}
              </span>
            </div>
            {claimId && isDraft ? (
              <label>
                <span className="muted">Advance amount to adjust</span>
                <input
                  inputMode="decimal"
                  max={maximumAdvanceAdjustment}
                  min={0}
                  onChange={(event) => setAdvanceAdjustmentAmount(Number(event.target.value) || 0)}
                  type="number"
                  value={advanceAdjustmentAmount}
                />
                <span className="muted">Maximum available: Rs {maximumAdvanceAdjustment.toLocaleString("en-IN")}</span>
                <button
                  className="button secondary"
                  disabled={busy || advanceAdjustmentAmount < 0 || advanceAdjustmentAmount > maximumAdvanceAdjustment}
                  onClick={() => void saveAdvanceAdjustment()}
                  type="button"
                >
                  {busy ? <Loader2 size={16} /> : <Check size={16} />}
                  Save adjustment
                </button>
              </label>
            ) : null}
          </div>
        ) : null}
        {isReturned ? (
          <div className="return-panel" style={{ marginTop: 12 }}>
            <strong>Preparing correction workspace</strong>
            <p>
              This claim was returned with this note: <strong>{rejectionReason ?? "No correction reason was provided."}</strong>
            </p>
            <p className="muted">
              Opening this page automatically unlocks the claim for editing. Once ready, the line items below will become editable.
            </p>
            {isPreparingCorrection || busy ? (
              <span className="loading-inline">
                <Loader2 size={16} />
                Preparing this claim for correction...
              </span>
            ) : (
              <button className="button secondary" disabled={busy} onClick={() => void reopenReturnedClaim()} type="button">
                <RotateCcw size={18} />
                Try preparing again
              </button>
            )}
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
            <h2>{editingLineItemId ? "Edit Line Item" : "Add Line Item"}</h2>
            <div className="grid cols-3">
              <label>
                <span className="muted">Expense head</span>
                <select value={lineItem.expenseHead} onChange={(event) => setLineItem({ ...lineItem, expenseHead: event.target.value })}>
                  <option value="">Select expense head</option>
                  {expenseHeadOptions.map((head) => (
                    <option key={head} value={head}>
                      {head}
                    </option>
                  ))}
                </select>
              </label>
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
                  max={lineDateMax}
                  min={lineDateMin}
                  onChange={(event) => setLineItem({ ...lineItem, transactionDate: event.target.value })}
                  type="date"
                  value={lineItem.transactionDate}
                />
              </label>
              <label>
                <span className="muted">Payment mode</span>
                <select value={lineItem.paymentMode} onChange={(event) => setLineItem({ ...lineItem, paymentMode: event.target.value as PaymentMode })}>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                </select>
              </label>
              <label>
                <span className="muted">Vendor name</span>
                <input value={lineItem.vendorName} onChange={(event) => setLineItem({ ...lineItem, vendorName: event.target.value })} />
              </label>
              <label>
                <span className="muted">{requiresInvoice ? "Client invoice number" : "Vendor invoice number"}</span>
                <input value={requiresInvoice ? lineItem.clientInvoiceNumber : lineItem.vendorInvoiceNumber} onChange={(event) => setLineItem(requiresInvoice ? { ...lineItem, clientInvoiceNumber: event.target.value } : { ...lineItem, vendorInvoiceNumber: event.target.value })} />
              </label>
              {requiresInvoice ? (
                <label>
                  <span className="muted">Vendor invoice number</span>
                  <input value={lineItem.vendorInvoiceNumber} onChange={(event) => setLineItem({ ...lineItem, vendorInvoiceNumber: event.target.value })} />
                </label>
              ) : null}
              <label>
                <span className="muted">Expense tag</span>
                <select
                  value={lineItem.expenseTag}
                  onChange={(event) =>
                    setLineItem({
                      ...lineItem,
                      expenseTag: event.target.value as ExpenseTag,
                      clientInvoiceNumber: lineItem.clientInvoiceNumber,
                      vendorInvoiceNumber: lineItem.vendorInvoiceNumber,
                      billableAmount: "",
                      siteOrDepartment: "",
                      siteId: ""
                    })
                  }
                >
                  <option value="PendingBilling">{expenseTagLabel("PendingBilling")}</option>
                  <option value="AlreadyBilled">{expenseTagLabel("AlreadyBilled")}</option>
                  <option value="ContractPartCost">{expenseTagLabel("ContractPartCost")}</option>
                  <option value="BackendCTC">{expenseTagLabel("BackendCTC")}</option>
                </select>
              </label>
              {requiresBillableAmount ? (
                <label>
                  <span className="muted">Billable amount</span>
                  <input inputMode="decimal" value={lineItem.billableAmount} onChange={(event) => setLineItem({ ...lineItem, billableAmount: event.target.value })} />
                </label>
              ) : null}
              {requiresSiteOrDepartment ? (
                <label>
                  <span className="muted">Site / department</span>
                  <input value={lineItem.siteOrDepartment} onChange={(event) => setLineItem({ ...lineItem, siteOrDepartment: event.target.value })} />
                </label>
              ) : null}
              {requiresSite ? (
                <label>
                  <span className="muted">Line site</span>
                  <select value={lineItem.siteId} onChange={(event) => setLineItem({ ...lineItem, siteId: event.target.value })}>
                    <option value="">Select site</option>
                    {sites.map((site) => (
                      <option key={site.siteId} value={site.siteId}>
                        {site.siteName}{site.clientName ? ` - ${site.clientName}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="button secondary" disabled={busy || !canAddLine} onClick={saveLineItem} type="button">
                {editingLineItemId ? <Check size={18} /> : <Plus size={18} />}
                {editingLineItemId ? "Update line item" : "Save line item"}
              </button>
              {editingLineItemId ? (
                <button className="button secondary" disabled={busy} onClick={cancelEditLineItem} type="button">
                  <X size={18} />
                  Cancel edit
                </button>
              ) : null}
            </div>
            {selectedAdvance ? (
              <p className="muted" style={{ marginTop: 10 }}>
                Reimbursement total after this line: Rs {settlementDraftTotalAfterLine.toLocaleString("en-IN")}.
                {" "}Advance adjusted: Rs {(settlementPreview?.advanceAdjusted ?? 0).toLocaleString("en-IN")}.
                {" "}Final payable: Rs {(settlementPreview?.finalPayable ?? 0).toLocaleString("en-IN")}. Remaining advance balance: Rs {(settlementPreview?.netAdvanceLeft ?? 0).toLocaleString("en-IN")}.
              </p>
            ) : null}
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
                  <button className="button" disabled={busy || !canSubmitClaim} onClick={requestSubmitClaim} type="button">
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
                  <th>Payment</th>
                  <th>Receipt</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {savedLineItems.map((item) => (
                  <tr key={item.lineItemId}>
                    <td>{item.description}</td>
                    <td>Rs {item.amount.toLocaleString("en-IN")}</td>
                    <td>{expenseTagLabel(item.expenseTag)}</td>
                    <td>{item.paymentMode ?? "Not set"}</td>
                    <td>
                      <span className={`badge ${item.missingReceiptFlag ? "warning" : "success"}`}>
                        {item.missingReceiptFlag ? "Missing" : `Attached ${item.attachmentHash ?? ""}`}
                      </span>
                    </td>
                    <td>
                      {submissionResult ? (
                        <span className="muted">Locked</span>
                      ) : !isDraft ? (
                        <span className="muted">Reopen first</span>
                      ) : (
                        <div className="actions">
                          <button className="button secondary" disabled={busy} onClick={() => startEditLineItem(item)} type="button">
                            <Pencil size={18} />
                            Edit
                          </button>
                          <button className="button secondary" disabled={busy} onClick={() => void deleteLineItem(item.lineItemId)} type="button">
                            <Trash2 size={18} />
                            Delete
                          </button>
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
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {savedLineItems.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No line items saved yet.</td>
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
      {advanceReviewOpen ? (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAdvanceReviewOpen(false)}>
          <div
            aria-describedby="advance-review-description"
            aria-labelledby="advance-review-title"
            aria-modal="true"
            className="modal"
            role="dialog"
          >
            <div className="section-heading">
              <div>
                <h2 id="advance-review-title">Review outstanding advances</h2>
                <p className="muted" id="advance-review-description">
                  You have paid advances with open balances. Apply one against this Rs {savedLineTotal.toLocaleString("en-IN")} claim, or submit without adjustment.
                </p>
              </div>
              <button aria-label="Close advance review" className="icon-button" disabled={busy} onClick={() => setAdvanceReviewOpen(false)} type="button">
                <X size={18} />
              </button>
            </div>
            <label>
              <span className="muted">Outstanding advance</span>
              <select
                autoFocus
                onChange={(event) => {
                  const nextAdvance = pendingAdvances.find((advance) => advance.claimId === event.target.value);
                  setAdvanceClaimId(event.target.value);
                  setAdvanceAdjustmentAmount(nextAdvance ? Math.min(savedLineTotal, nextAdvance.advanceBalance) : 0);
                }}
                value={advanceClaimId}
              >
                {pendingAdvances.map((advance) => (
                  <option key={advance.claimId} value={advance.claimId}>
                    {advance.ticketId} - Rs {advance.advanceBalance.toLocaleString("en-IN")} open
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted">Amount to adjust</span>
              <input
                inputMode="decimal"
                max={maximumAdvanceAdjustment}
                min={0}
                onChange={(event) => setAdvanceAdjustmentAmount(Number(event.target.value) || 0)}
                type="number"
                value={advanceAdjustmentAmount}
              />
              <span className="muted">Maximum available for this claim: Rs {maximumAdvanceAdjustment.toLocaleString("en-IN")}</span>
            </label>
            {selectedAdvance ? (
              <div className="settlement-summary">
                <div>
                  <span className="muted">Advance adjusted</span>
                  <strong>Rs {(savedSettlement?.advanceAdjusted ?? 0).toLocaleString("en-IN")}</strong>
                </div>
                <div>
                  <span className="muted">Final payable</span>
                  <strong>Rs {(savedSettlement?.finalPayable ?? savedLineTotal).toLocaleString("en-IN")}</strong>
                </div>
                <div>
                  <span className="muted">Advance left</span>
                  <strong>Rs {(savedSettlement?.netAdvanceLeft ?? selectedAdvance.advanceBalance).toLocaleString("en-IN")}</strong>
                </div>
              </div>
            ) : null}
            <div className="modal-actions">
              <button className="button secondary" disabled={busy} onClick={() => void submitClaim(false)} type="button">
                Submit without adjustment
              </button>
              <button
                className="button"
                disabled={busy || !advanceClaimId || advanceAdjustmentAmount <= 0 || advanceAdjustmentAmount > maximumAdvanceAdjustment}
                onClick={() => void submitClaim(true)}
                type="button"
              >
                Apply advance and submit
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ActionFeedback message={message} onDismiss={() => setMessage("")} />
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

function addUtcDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function endOfMonth(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  if (!year || !month) return "";
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function maxDate(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? "";
}

function minDate(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort()[0] ?? "";
}
