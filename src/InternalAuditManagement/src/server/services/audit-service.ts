import { conflict, forbidden, notFound } from "../errors/application-error";
import { statusLabel, type ClaimDetail, type UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { AuditClaimDecisionInput } from "../validation/claim.schemas";
import type { NotificationService } from "./notification-service";

export class AuditService {
  constructor(
    private readonly claims: ClaimRepository,
    private readonly notifications: NotificationService
  ) {}

  async listQueue(user: UserContext) {
    this.assertAuditor(user);
    const items = await this.claims.listAuditQueue();
    return {
      items,
      totalPending: items.length
    };
  }

  async approveClaim(claimId: string, input: AuditClaimDecisionInput, user: UserContext) {
    const claim = await this.loadAuditClaim(claimId, user);
    const pendingStep = this.pendingAuditorStep(claim);

    await this.claims.decideApprovalStep(pendingStep.stepId, "Approved", input.remarks);
    const updated = await this.claims.submitClaim(claimId, "FinanceConfirmed");
    const hasPendingFinanceStep = claim.approvalSteps.some((step) => step.requiredApproverRole === "Finance" && step.decision === "Pending");
    if (!hasPendingFinanceStep) {
      await this.claims.createFinanceApprovalStep(claimId);
    }
    await Promise.all([
      this.createBillingAlertsForClaim(claim, user),
      this.claims.appendAuditLog({
        claimId,
        actorUserId: user.userId,
        actionType: "AUDIT_APPROVE",
        preActionStatus: claim.status,
        postActionStatus: updated.status,
        auditRemarks: input.remarks,
        correlationId: user.correlationId
      }),
      this.notifyFinance(claim, "Auditor approved claim for payment release.")
    ]);

    return {
      claimId,
      newStatus: updated.status,
      newStatusLabel: statusLabel(updated.status),
      message: "Audit approved. Claim is back with Finance for payment release."
    };
  }

  async rejectClaim(claimId: string, input: AuditClaimDecisionInput, user: UserContext) {
    return this.returnToClaimant(claimId, input, user, "AUDIT_REJECT", "Audit rejected");
  }

  async requestInformation(claimId: string, input: AuditClaimDecisionInput, user: UserContext) {
    return this.returnToClaimant(claimId, input, user, "AUDIT_INFO_REQUEST", "Pending information");
  }

  private async returnToClaimant(
    claimId: string,
    input: AuditClaimDecisionInput,
    user: UserContext,
    actionType: "AUDIT_REJECT" | "AUDIT_INFO_REQUEST",
    reasonPrefix: "Audit rejected" | "Pending information"
  ) {
    const claim = await this.loadAuditClaim(claimId, user);
    const pendingStep = this.pendingAuditorStep(claim);
    const reason = `${reasonPrefix}: ${input.remarks}`;
    const submitter = await this.claims.getEmployee(claim.submitterEmployeeId);

    await this.claims.decideApprovalStep(pendingStep.stepId, "Rejected", reason);
    const updated = await this.claims.rejectClaim(claimId, reason);
    await Promise.all([
      this.claims.appendAuditLog({
        claimId,
        actorUserId: user.userId,
        actionType,
        preActionStatus: claim.status,
        postActionStatus: updated.status,
        auditRemarks: reason,
        correlationId: user.correlationId
      }),
      submitter
        ? this.notifications.enqueueAndSend({
            recipientEmployeeId: submitter.employeeId,
            recipientEmail: submitter.email,
            subject: `${reasonPrefix} for ${claim.ticketId}`,
            body: `${claim.ticketId} has been returned by Audit. ${input.remarks}`,
            relatedClaimId: claimId
          })
        : Promise.resolve(null)
    ]);

    return {
      claimId,
      newStatus: updated.status,
      newStatusLabel: statusLabel(updated.status),
      message: `${reasonPrefix}. Claim returned to claimant with audit details.`
    };
  }

  private async loadAuditClaim(claimId: string, user: UserContext) {
    this.assertAuditor(user);
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) throw notFound("Claim was not found.");
    if (claim.status !== "AuditPending") {
      throw conflict("Only claims pending Auditor review can be actioned here.");
    }
    if (claim.claimKind !== "Advance" && !claim.physicalReceiptConfirmedAt) {
      throw conflict("Finance must confirm physical receipt before Auditor review.");
    }
    return claim;
  }

  private pendingAuditorStep(claim: ClaimDetail) {
    const step = claim.approvalSteps
      .filter((item) => item.decision === "Pending")
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .find((item) => item.requiredApproverRole === "Auditor");
    if (!step) throw conflict("Auditor approval step is missing for this claim.");
    return step;
  }

  private async createBillingAlertsForClaim(claim: ClaimDetail, user: UserContext) {
    const pendingBillingItems = claim.lineItems.filter((item) => item.expenseTag === "PendingBilling");
    for (const item of pendingBillingItems) {
      const alert = await this.claims.createBillingAlert({
        claimId: claim.claimId,
        lineItemId: item.lineItemId,
        nextSendAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      });

      if (alert) {
        await this.claims.appendAuditLog({
          claimId: claim.claimId,
          actorUserId: user.userId,
          actionType: "BILLING_ALERT_CREATED",
          preActionStatus: "PendingBilling",
          postActionStatus: "PendingBilling",
          auditRemarks: `Billing alert created after Auditor approval for line item ${item.lineItemId}`,
          correlationId: user.correlationId
        });
      }
    }
  }

  private async notifyFinance(claim: ClaimDetail, body: string) {
    const financeRecipients = (await this.claims.listEmployees()).filter((employee) => ["Finance", "FinanceHOD"].includes(employee.role));
    await Promise.all(
      financeRecipients.map((employee) =>
        this.notifications.enqueueAndSend({
          recipientEmployeeId: employee.employeeId,
          recipientEmail: employee.email,
          subject: `Audit approved ${claim.ticketId}`,
          body,
          relatedClaimId: claim.claimId
        })
      )
    );
  }

  private assertAuditor(user: UserContext) {
    if (!["Auditor", "MD"].includes(user.role)) {
      throw forbidden("Only Auditor or MD can perform audit review.");
    }
  }
}
