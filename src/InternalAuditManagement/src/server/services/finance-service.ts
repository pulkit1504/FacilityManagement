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

    if (!claim.physicalReceiptConfirmedAt) {
      throw conflict("Physical receipt confirmation is required before payment can be released.");
    }

    const updated = await this.claims.submitClaim(claimId, "PaymentReleased");
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
}
