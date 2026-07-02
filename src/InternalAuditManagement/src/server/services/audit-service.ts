import { conflict, forbidden, notFound } from "../errors/application-error";
import { statusLabel, type ClaimDetail, type UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { AuditClaimDecisionInput, AuditLineReviewInput, LineExpenseHeadCorrectionInput } from "../validation/claim.schemas";
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

  async listImprestRegister(user: UserContext) {
    this.assertAuditor(user);
    const items = await this.claims.listAuditImprestRegister();
    return {
      items,
      total: items.length
    };
  }

  async receiveVouchers(claimId: string, user: UserContext) {
    const claim = await this.loadAuditClaim(claimId, user, false);
    const auditEntries = await this.claims.listAuditLogForClaim(claimId);
    const existingReceipt = auditEntries
      .filter((entry) => entry.actionType === "AUDITOR_VOUCHERS_RECEIVED")
      .at(-1);

    if (existingReceipt) {
      return {
        claimId,
        receivedAt: existingReceipt.actionTimestamp,
        message: "Voucher pack was already marked as received by Audit."
      };
    }

    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: "AUDITOR_VOUCHERS_RECEIVED",
      preActionStatus: claim.status,
      postActionStatus: claim.status,
      auditRemarks: "Physical voucher pack received by Auditor for pre-payment review.",
      correlationId: user.correlationId
    });

    return {
      claimId,
      receivedAt: new Date().toISOString(),
      message: "Voucher pack marked as received. Auditor decision actions are now available."
    };
  }

  async approveClaim(claimId: string, input: AuditClaimDecisionInput, user: UserContext) {
    const claim = await this.loadAuditClaim(claimId, user);
    this.assertAllLinesApproved(claim);
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

  async reviewLineItem(claimId: string, lineItemId: string, input: AuditLineReviewInput, user: UserContext) {
    const claim = await this.loadAuditClaim(claimId, user);
    const lineItem = claim.lineItems.find((item) => item.lineItemId === lineItemId);
    if (!lineItem) throw notFound("Line item was not found for this claim.");

    const approvedAmount = input.decision === "Approved" ? Number(input.approvedAmount ?? 0) : null;
    if (approvedAmount !== null && approvedAmount > lineItem.amount) {
      throw conflict("Audit approved amount cannot exceed the line item amount.");
    }

    const updated = await this.claims.reviewAuditLineItem(claimId, lineItemId, {
      decision: input.decision,
      approvedAmount,
      remarks: input.remarks ?? null,
      reviewedByUserId: user.userId
    });

    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: input.decision === "Approved" ? "AUDIT_LINE_APPROVE" : "AUDIT_LINE_REJECT",
      preActionStatus: claim.status,
      postActionStatus: claim.status,
      auditRemarks:
        input.decision === "Approved"
          ? `Audit approved ${approvedAmount} for line item ${lineItemId}.${input.remarks ? ` ${input.remarks}` : ""}`
          : `Audit rejected line item ${lineItemId}. ${input.remarks}`,
      correlationId: user.correlationId
    });

    return {
      lineItem: updated,
      message: input.decision === "Approved" ? "Audit line approval recorded." : "Audit line rejection recorded."
    };
  }

  async correctLineItemExpenseHead(claimId: string, lineItemId: string, input: LineExpenseHeadCorrectionInput, user: UserContext) {
    const claim = await this.loadAuditClaim(claimId, user);
    const lineItem = claim.lineItems.find((item) => item.lineItemId === lineItemId);
    if (!lineItem) throw notFound("Line item was not found for this claim.");

    const nextExpenseHead = input.expenseHead.trim();
    if (lineItem.expenseHead === nextExpenseHead) {
      return {
        lineItem,
        message: "Expense head is already set to this value."
      };
    }

    const updated = await this.claims.updateLineItemExpenseHead(claimId, lineItemId, nextExpenseHead);
    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: "EXPENSE_HEAD_CORRECTED",
      preActionStatus: claim.status,
      postActionStatus: claim.status,
      auditRemarks: `Audit corrected expense head for line item ${lineItemId}: ${lineItem.expenseHead ?? "Not set"} -> ${updated.expenseHead ?? "Not set"}.`,
      correlationId: user.correlationId
    });

    return {
      lineItem: updated,
      message: "Expense head corrected."
    };
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

  private async loadAuditClaim(claimId: string, user: UserContext, requireVoucherReceipt = true) {
    this.assertAuditor(user);
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) throw notFound("Claim was not found.");
    if (claim.status !== "AuditPending") {
      throw conflict("Only claims pending Auditor review can be actioned here.");
    }
    if (claim.claimKind !== "Advance" && !claim.physicalReceiptConfirmedAt) {
      throw conflict("Finance must confirm physical receipt before Auditor review.");
    }
    if (requireVoucherReceipt && claim.claimKind !== "Advance") {
      const auditEntries = await this.claims.listAuditLogForClaim(claimId);
      if (!auditEntries.some((entry) => entry.actionType === "AUDITOR_VOUCHERS_RECEIVED")) {
        throw conflict("Auditor must mark the voucher pack as received before making an audit decision.");
      }
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

  private assertAllLinesApproved(claim: ClaimDetail) {
    const incompleteLines = claim.lineItems.filter((item) => item.auditReviewStatus !== "Approved" || item.auditApprovedAmount === null);
    if (incompleteLines.length > 0) {
      throw conflict("Approve every line item and enter the audit-approved amount before approving the claim.", {
        incompleteLineItemIds: incompleteLines.map((item) => item.lineItemId)
      });
    }
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
    const financeRecipients = (await this.claims.listEmployees()).filter((employee) => employee.role === "Finance");
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
