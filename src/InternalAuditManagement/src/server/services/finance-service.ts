import { conflict, forbidden, notFound } from "../errors/application-error";
import { statusLabel, type UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { ConfirmPhysicalReceiptInput } from "../validation/claim.schemas";

export class FinanceService {
  constructor(private readonly claims: ClaimRepository) {}

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

  async exportImprestLedger(user: UserContext) {
    this.assertFinance(user);
    const rows = await this.claims.listImprestLedgerReport();
    return toCsv(
      ["Ticket", "Claimant", "Site", "Advance Amount", "Settled Amount", "Open Balance", "Status", "Paid At"],
      rows.map((row) => [
        row.ticketId,
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

  async exportBillableClaims(user: UserContext) {
    this.assertFinance(user);
    const rows = await this.claims.listBillableClaimReport();
    return toCsv(
      [
        "Ticket",
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

  async confirmPhysicalReceipt(claimId: string, input: ConfirmPhysicalReceiptInput, user: UserContext) {
    this.assertFinance(user);

    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) throw notFound("Claim was not found.");

    if (!["HodApproved", "MdApproved", "FinanceConfirmed"].includes(claim.status)) {
      throw conflict("Physical receipt can only be confirmed after operational approval.");
    }

    const confirmedAt = new Date(`${input.physicalReceiptDate}T${input.physicalReceiptTime}:00+05:30`).toISOString();
    const updated = await this.claims.confirmPhysicalReceipt(claimId, confirmedAt, user.userId);

    if (claim.status !== "FinanceConfirmed") {
      const step = await this.claims.getPendingApprovalStep(claimId);
      if (step?.requiredApproverRole === "Finance") {
        await this.claims.decideApprovalStep(step.stepId, "Approved", `Physical voucher received by ${input.receivedByName}`);
      }
      const financeConfirmed = await this.claims.submitClaim(claimId, "FinanceConfirmed");
      await this.createBillingAlertsForClaim(claimId, user);
      await this.claims.appendAuditLog({
        claimId,
        actorUserId: user.userId,
        actionType: "FINANCE_CONFIRM",
        preActionStatus: claim.status,
        postActionStatus: financeConfirmed.status,
        auditRemarks: `Physical voucher received by ${input.receivedByName}`,
        correlationId: user.correlationId
      });
    }

    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: "PHYSICAL_RECEIPT_CONFIRM",
      preActionStatus: claim.status,
      postActionStatus: "FinanceConfirmed",
      auditRemarks: `Physical voucher received by ${input.receivedByName}`,
      correlationId: user.correlationId
    });

    return {
      message: "Physical receipt confirmed. You can now release the payment.",
      physicalReceiptConfirmedAt: updated.physicalReceiptConfirmedAt
    };
  }

  async releasePayment(claimId: string, user: UserContext) {
    this.assertFinance(user);

    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) throw notFound("Claim was not found.");

    if (claim.status !== "FinanceConfirmed") {
      throw conflict("Only Finance-confirmed claims can be released for payment.");
    }

    if (claim.claimKind !== "Advance" && !claim.physicalReceiptConfirmedAt) {
      throw conflict("Physical receipt confirmation is required before payment can be released.");
    }

    const updated = await this.claims.submitClaim(claimId, "PaymentReleased");
    await this.claims.applySettlementToAdvance(claimId);
    await this.createBillingAlertsForClaim(claimId, user);
    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: "PAYMENT_RELEASE",
      preActionStatus: claim.status,
      postActionStatus: updated.status,
      correlationId: user.correlationId
    });

    return {
      claimId,
      newStatus: updated.status,
      newStatusLabel: statusLabel(updated.status),
      message: "Payment released. Claimant has been notified."
    };
  }

  private assertFinance(user: UserContext) {
    if (!["Finance", "FinanceHOD"].includes(user.role)) {
      throw forbidden("Only Finance users can perform this action.");
    }
  }

  private async createBillingAlertsForClaim(claimId: string, user: UserContext) {
    const claim = await this.claims.getClaimDetail(claimId);
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
