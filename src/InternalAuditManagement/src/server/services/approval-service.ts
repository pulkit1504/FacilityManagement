import { conflict, forbidden, notFound } from "../errors/application-error";
import { statusLabel, type UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { NotificationService } from "./notification-service";
import type { ApproveClaimInput, RejectClaimInput } from "../validation/claim.schemas";

export class ApprovalService {
  constructor(
    private readonly claims: ClaimRepository,
    private readonly notifications: NotificationService
  ) {}

  async listQueue(user: UserContext) {
    if (!["ClusterHead", "HOD", "MD"].includes(user.role)) {
      throw forbidden("Only Cluster Head, HOD, and MD approvers can view approval queues.");
    }

    const items = await this.claims.listApprovalQueue(user.userId, user.role);
    return {
      items,
      nextCursor: null,
      totalPending: items.length
    };
  }

  async approveClaim(claimId: string, input: ApproveClaimInput, user: UserContext) {
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) throw notFound("Claim was not found.");

    const step = claim.approvalSteps.find((item) => item.decision === "Pending");
    if (!step) throw conflict("This claim has no pending approval step.");

    if (step.requiredApproverRole !== user.role || step.assignedApproverId !== user.userId) {
      throw forbidden("Only the assigned approver can approve this claim.");
    }

    if (claim.submitterEmployeeId === user.userId) {
      throw conflict("A user cannot approve their own claim.");
    }

    if (claim.status !== "Submitted") {
      throw conflict("Only Submitted claims can be operationally approved.");
    }

    const newStatus = user.role === "MD" ? "MdApproved" : "HodApproved";
    const nextOperationalStep = claim.approvalSteps
      .filter((item) => item.decision === "Pending" && item.stepId !== step.stepId)
      .sort((a, b) => a.stepOrder - b.stepOrder)[0];
    const approvalScope = step.lineItemId
      ? claim.lineItems.find((item) => item.lineItemId === step.lineItemId)
      : null;
    const scopeText = approvalScope
      ? ` Cash line "${approvalScope.description}" for Rs ${approvalScope.amount.toLocaleString("en-IN")} was approved by MD.`
      : "";

    if (nextOperationalStep) {
      await Promise.all([
        this.claims.decideApprovalStep(step.stepId, "Approved", input.remarks ?? null),
        this.claims.appendAuditLog({
          claimId,
          actorUserId: user.userId,
          actionType: approvalActionType(user.role),
          preActionStatus: claim.status,
          postActionStatus: claim.status,
          auditRemarks: input.remarks ?? `Approved and routed to ${nextOperationalStep.requiredApproverRole}.${scopeText}`,
          correlationId: user.correlationId
        })
      ]);

      if (nextOperationalStep.assignedApproverId) {
        const nextApprover = await this.claims.getEmployee(nextOperationalStep.assignedApproverId);
        if (nextApprover) {
          await this.notifications.enqueueAndSend({
            recipientEmployeeId: nextApprover.employeeId,
            recipientEmail: nextApprover.email,
            subject: `Claim ${claim.ticketId} is pending your approval`,
            body: `Claim ${claim.ticketId} for Rs ${claim.totalAmount.toLocaleString("en-IN")} has been routed to you.${nextOperationalStep.lineItemId ? " The MD approval is limited to a cash line item above Rs 10,000." : ""}`,
            relatedClaimId: claimId
          });
        }
      }

      return {
        claimId,
        newStatus: claim.status,
        newStatusLabel: statusLabel(claim.status),
        nextAction: `Routed to ${nextOperationalStep.requiredApproverRole}`,
        message: "Claim approved and routed to the next approver."
      };
    }

    const [updated] = await Promise.all([
      this.claims.submitClaim(claimId, newStatus),
      this.claims.decideApprovalStep(step.stepId, "Approved", input.remarks ?? null)
    ]);

    await Promise.all([
      this.claims.createFinanceApprovalStep(claimId),
      this.claims.appendAuditLog({
        claimId,
        actorUserId: user.userId,
        actionType: approvalActionType(user.role),
        preActionStatus: claim.status,
        postActionStatus: updated.status,
        auditRemarks: input.remarks ?? (scopeText.trim() || null),
        correlationId: user.correlationId
      })
    ]);

    const employees = await this.claims.listEmployees();
    const financeRecipients = employees.filter((employee) => employee.role === "Finance");
    await Promise.all(
      financeRecipients.map((employee) =>
        this.notifications.enqueueAndSend({
          recipientEmployeeId: employee.employeeId,
          recipientEmail: employee.email,
          subject: `Claim ${claim.ticketId} is ready for Finance review`,
          body: `Claim ${claim.ticketId} has completed operational approval and is ready for Finance receipt confirmation.`,
          relatedClaimId: claimId
        })
      )
    );

    return {
      claimId,
      newStatus: updated.status,
      newStatusLabel: statusLabel(updated.status),
      nextAction: "Routed to Finance team",
      message: "Claim approved successfully."
    };
  }

  async rejectClaim(claimId: string, input: RejectClaimInput, user: UserContext) {
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) throw notFound("Claim was not found.");

    const step = claim.approvalSteps.find((item) => item.decision === "Pending");
    if (!step) throw conflict("This claim has no pending approval step.");

    const isFinanceStep = step.requiredApproverRole === "Finance" && user.role === "Finance";
    const isAssignedOperationalApprover = step.requiredApproverRole === user.role && step.assignedApproverId === user.userId;

    if (!isFinanceStep && !isAssignedOperationalApprover) {
      throw forbidden("Only the assigned approver can reject this claim.");
    }

    const [updated] = await Promise.all([
      this.claims.rejectClaim(claimId, input.reason),
      this.claims.decideApprovalStep(step.stepId, "Rejected", input.reason)
    ]);
    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: "REJECT",
      preActionStatus: claim.status,
      postActionStatus: updated.status,
      auditRemarks: input.reason,
      correlationId: user.correlationId
    });

    const submitter = await this.claims.getEmployee(claim.submitterEmployeeId);
    if (submitter) {
      await this.notifications.enqueueAndSend({
        recipientEmployeeId: submitter.employeeId,
        recipientEmail: submitter.email,
        subject: `Claim ${claim.ticketId} was returned`,
        body: `Claim ${claim.ticketId} was returned for correction. Reason: ${input.reason}`,
        relatedClaimId: claimId
      });
    }

    return {
      claimId,
      newStatus: updated.status,
      newStatusLabel: statusLabel(updated.status),
      rejectionReason: updated.rejectionReason,
      message: "Claim returned to claimant."
    };
  }
}

function approvalActionType(role: UserContext["role"]) {
  if (role === "MD") return "MD_APPROVE";
  if (role === "ClusterHead") return "CLUSTER_HEAD_APPROVE";
  return "HOD_APPROVE";
}
