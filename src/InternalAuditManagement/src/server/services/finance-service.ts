import { conflict, forbidden, notFound } from "../errors/application-error";
import { statusLabel, type OperatingCompany, type UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { ConfirmPhysicalReceiptInput, FinanceLineReviewInput } from "../validation/claim.schemas";
import type { NotificationService } from "./notification-service";

export class FinanceService {
  constructor(
    private readonly claims: ClaimRepository,
    private readonly notifications: NotificationService
  ) {}

  async listQueue(user: UserContext) {
    this.assertFinance(user);
    const items = await this.claims.listFinanceQueue();
    return {
      items,
      nextCursor: null,
      totalPending: items.length
    };
  }

  async listPendingAdvances(user: UserContext) {
    this.assertFinance(user);
    const items = await this.claims.listPendingAdvances(user.userId, user.role);
    return {
      items,
      totalPending: items.length
    };
  }

  async exportImprestLedger(user: UserContext, filters: ReportFilters = {}) {
    this.assertFinance(user);
    const rows = (await this.claims.listImprestLedgerReport()).filter((row) => matchesReportFilters(row, filters, row.paidAt));
    return toCsv(
      ["Ticket", "Company", "Claimant", "Site", "Advance Amount", "Settled Amount", "Open Balance", "Status", "Paid At"],
      rows.map((row) => [
        row.ticketId,
        row.company,
        row.claimantName,
        row.siteName ?? "",
        row.advanceAmount,
        row.settledAmount,
        row.advanceBalance,
        row.status,
        row.paidAt ?? ""
      ])
    );
  }

  async exportBillableClaims(user: UserContext, filters: ReportFilters = {}) {
    this.assertFinance(user);
    const rows = (await this.claims.listBillableClaimReport()).filter((row) => matchesReportFilters(row, filters, row.transactionDate));
    return toCsv(
      [
        "Ticket",
        "Company",
        "Claimant",
        "Site",
        "Expense Head",
        "Description",
        "Amount",
        "Billable Amount",
        "Expense Tag",
        "Invoice Number",
        "Recovery Status",
        "Transaction Date"
      ],
      rows.map((row) => [
        row.ticketId,
        row.company,
        row.claimantName,
        row.siteName ?? "",
        row.expenseHead ?? "",
        row.description,
        row.amount,
        row.billableAmount,
        row.expenseTag,
        row.invoiceNumber ?? "",
        row.recoveryStatus,
        row.transactionDate
      ])
    );
  }

  async exportCompanyExpenses(user: UserContext, filters: ReportFilters = {}) {
    this.assertFinance(user);
    const rows = (await this.claims.listCompanyExpenseReport()).filter((row) => matchesReportFilters(row, filters, row.transactionDate));
    return toCsv(
      [
        "Ticket",
        "Company",
        "Claim Type",
        "Status",
        "Claimant",
        "Site",
        "Expense Head",
        "Description",
        "Expense Tag",
        "Amount",
        "Billable Amount",
        "Non Billable Amount",
        "CTC Amount",
        "Contractual Part Amount",
        "Client Invoice",
        "Vendor",
        "Vendor Invoice",
        "Transaction Date",
        "Payment Mode",
        "Finance Review",
        "Audit Review",
        "Audit Approved Amount",
        "Advance Amount",
        "Advance Adjusted",
        "Final Payable",
        "Updated At"
      ],
      rows.map((row) => [
        row.ticketId,
        row.company,
        row.claimKind,
        row.status,
        row.claimantName,
        row.siteName ?? "",
        row.expenseHead ?? "",
        row.description,
        row.expenseTag,
        row.amount,
        row.billableAmount,
        row.nonBillableAmount,
        row.ctcAmount,
        row.contractualPartAmount,
        row.clientInvoiceNumber ?? "",
        row.vendorName ?? "",
        row.vendorInvoiceNumber ?? "",
        row.transactionDate,
        row.paymentMode ?? "",
        row.financeReviewStatus,
        row.auditReviewStatus,
        row.auditApprovedAmount ?? "",
        row.advanceAmount,
        row.advanceAdjustmentAmount,
        row.finalPayableAmount,
        row.updatedAt
      ])
    );
  }

  async confirmPhysicalReceipt(claimId: string, input: ConfirmPhysicalReceiptInput, user: UserContext) {
    this.assertFinance(user);

    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) throw notFound("Claim was not found.");

    if (!["HodApproved", "MdApproved"].includes(claim.status)) {
      throw conflict("Physical receipt can only be confirmed after operational approval.");
    }

    const unaccepted = claim.lineItems.filter((item) => item.financeReviewStatus !== "Accepted");
    if (unaccepted.length > 0) {
      throw conflict("Complete Finance review before confirming the voucher pack.", {
        errors: [`${unaccepted.length} line item(s) still need Finance acceptance.`]
      });
    }

    const confirmedAt = new Date(`${input.physicalReceiptDate}T${input.physicalReceiptTime}:00+05:30`).toISOString();
    const [updated, pendingStep] = await Promise.all([
      this.claims.confirmPhysicalReceipt(claimId, confirmedAt, user.userId),
      this.claims.getPendingApprovalStep(claimId)
    ]);

    if (pendingStep?.requiredApproverRole === "Finance") {
      await this.claims.decideApprovalStep(pendingStep.stepId, "Approved", `Physical voucher received by ${input.receivedByName}`);
    }
    const auditPending = await this.claims.submitClaim(claimId, "AuditPending");
    await this.claims.createAuditorApprovalStep(claimId);

    await Promise.all([
      this.claims.appendAuditLog({
        claimId,
        actorUserId: user.userId,
        actionType: "PHYSICAL_RECEIPT_CONFIRM",
        preActionStatus: claim.status,
        postActionStatus: auditPending.status,
        auditRemarks: `Physical voucher received by ${input.receivedByName}. Routed to Auditor for pre-payment review.`,
        correlationId: user.correlationId
      }),
      this.notifyAuditors(claim)
    ]);

    return {
      message: "Physical receipt confirmed. Claim routed to Auditor for pre-payment review.",
      physicalReceiptConfirmedAt: updated.physicalReceiptConfirmedAt
    };
  }

  async reviewLineItem(claimId: string, lineItemId: string, input: FinanceLineReviewInput, user: UserContext) {
    this.assertFinance(user);

    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) throw notFound("Claim was not found.");

    if (!["HodApproved", "MdApproved", "FinanceConfirmed"].includes(claim.status)) {
      throw conflict("Line items can be reviewed only after operational approval.");
    }

    const lineItem = claim.lineItems.find((item) => item.lineItemId === lineItemId);
    if (!lineItem) throw notFound("Line item was not found on this claim.");

    const updated = await this.claims.reviewLineItem(claimId, lineItemId, input.decision, input.remarks ?? null);
    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: input.decision === "Accepted" ? "FINANCE_LINE_ACCEPT" : "FINANCE_LINE_REJECT",
      preActionStatus: claim.status,
      postActionStatus: claim.status,
      auditRemarks: input.remarks ?? `${input.decision} line item ${lineItemId}`,
      correlationId: user.correlationId
    });

    return {
      lineItemId: updated.lineItemId,
      financeReviewStatus: updated.financeReviewStatus,
      financeReviewRemarks: updated.financeReviewRemarks,
      message: input.decision === "Accepted" ? "Line item accepted." : "Line item rejected. Return the claim to claimant for correction."
    };
  }

  async releasePayment(claimId: string, user: UserContext) {
    this.assertFinance(user);

    let claim = await this.claims.getClaimDetail(claimId);
    if (!claim) throw notFound("Claim was not found.");

    if (claim.claimKind !== "Advance" && claim.status !== "FinanceConfirmed") {
      throw conflict("Only Finance-confirmed claims can be released for payment.");
    }

    if (claim.claimKind !== "Advance" && !claim.physicalReceiptConfirmedAt) {
      throw conflict("Physical receipt confirmation is required before payment can be released.");
    }

    if (claim.claimKind !== "Advance") {
      const auditorApproved = claim.approvalSteps.some(
        (step) => step.requiredApproverRole === "Auditor" && step.decision === "Approved"
      );
      if (!auditorApproved) {
        throw conflict("Auditor approval is required before payment can be released.");
      }

      const unaccepted = claim.lineItems.filter((item) => item.financeReviewStatus !== "Accepted");
      if (unaccepted.length > 0) {
        throw conflict("All line items must be accepted by Finance before payment release.", {
          errors: [`${unaccepted.length} line item(s) still need Finance acceptance.`]
        });
      }
    }

    if (claim.advanceClaimId) {
      await this.claims.updateClaimTotal(claimId);
      claim = await this.claims.getClaimDetail(claimId);
      if (!claim) throw notFound("Claim was not found.");

      const advance = claim.advanceClaimId ? await this.claims.getClaimDetail(claim.advanceClaimId) : null;
      if (!advance || advance.claimKind !== "Advance" || advance.status !== "PaymentReleased") {
        throw conflict("Advance adjustments must be linked to a paid advance.");
      }
    }

    const submitter = await this.claims.getEmployee(claim.submitterEmployeeId);
    if (!submitter) {
      throw conflict("Submitter employee record is missing or inactive.");
    }

    if (claim.finalPayableAmount > 0) {
      const missingBankFields = [
        !submitter.bankAccountHolderName ? "account holder" : null,
        !submitter.bankAccountNumber ? "account number" : null,
        !submitter.bankIfsc ? "IFSC" : null,
        !submitter.bankName ? "bank name" : null
      ].filter((field): field is string => Boolean(field));
      if (missingBankFields.length > 0) {
        throw conflict("Beneficiary bank details are required before payment release.", {
          errors: [`Missing: ${missingBankFields.join(", ")}.`]
        });
      }
    }

    const updated = await this.claims.releasePaymentAtomically(claimId, user.userId, user.correlationId);
    const notification = await this.notifications.enqueueAndSend({
      recipientEmployeeId: submitter.employeeId,
      recipientEmail: submitter.email,
      subject: `Payment released for ${claim.ticketId}`,
      body: `Payment processing is complete for ${claim.ticketId}. Final payable amount: Rs ${claim.finalPayableAmount.toLocaleString("en-IN")}.`,
      relatedClaimId: claimId
    });

    return {
      claimId,
      newStatus: updated.status,
      newStatusLabel: statusLabel(updated.status),
      message: notification.status === "Sent"
        ? "Payment released. Claimant notification sent."
        : "Payment released, but claimant notification delivery failed. Admin can retry it."
    };
  }

  private assertFinance(user: UserContext) {
    if (user.role !== "Finance") {
      throw forbidden("Only Finance users can perform this action.");
    }
  }

  private async createBillingAlertsForClaim(claimId: string, user: UserContext, existingClaim?: Awaited<ReturnType<ClaimRepository["getClaimDetail"]>>) {
    const claim = existingClaim ?? await this.claims.getClaimDetail(claimId);
    if (!claim) throw notFound("Claim was not found.");

    const pendingBillingItems = claim.lineItems.filter((item) => item.expenseTag === "PendingBilling");
    for (const item of pendingBillingItems) {
      const alert = await this.claims.createBillingAlert({
        claimId,
        lineItemId: item.lineItemId,
        nextSendAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      });

      if (alert) {
        await this.claims.appendAuditLog({
          claimId,
          actorUserId: user.userId,
          actionType: "BILLING_ALERT_CREATED",
          preActionStatus: "PendingBilling",
          postActionStatus: "PendingBilling",
          auditRemarks: `Billing alert created for line item ${item.lineItemId}`,
          correlationId: user.correlationId
        });
      }
    }
  }

  private async notifyAuditors(claim: NonNullable<Awaited<ReturnType<ClaimRepository["getClaimDetail"]>>>) {
    const auditors = (await this.claims.listEmployees()).filter((employee) => employee.role === "Auditor");
    await Promise.all(
      auditors.map((auditor) =>
        this.notifications.enqueueAndSend({
          recipientEmployeeId: auditor.employeeId,
          recipientEmail: auditor.email,
          subject: `Audit review required for ${claim.ticketId}`,
          body: `${claim.ticketId} has a confirmed physical receipt and is waiting for Auditor review.`,
          relatedClaimId: claim.claimId
        })
      )
    );
  }
}

type ReportFilters = {
  site?: string | null;
  claimant?: string | null;
  month?: string | null;
  company?: OperatingCompany | "All" | null;
};

function matchesReportFilters(row: { siteName: string | null; claimantName: string; company?: OperatingCompany }, filters: ReportFilters, dateValue?: string | null) {
  if (filters.site && row.siteName !== filters.site) return false;
  if (filters.claimant && row.claimantName !== filters.claimant) return false;
  if (filters.company && filters.company !== "All" && row.company !== filters.company) return false;
  if (filters.month && (!dateValue || !dateValue.startsWith(filters.month))) return false;
  return true;
}

function toCsv(headers: string[], rows: Array<Array<string | number>>) {
  return [headers, ...rows]
    .map((row) => row.map((value) => csvCell(String(value))).join(","))
    .join("\n");
}

function csvCell(value: string) {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll("\"", "\"\"")}"`;
}
