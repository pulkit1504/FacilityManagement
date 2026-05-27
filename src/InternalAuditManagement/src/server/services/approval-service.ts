import { conflict, forbidden, notFound } from "../errors/application-error";
import { statusLabel, type UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { ApproveClaimInput, RejectClaimInput } from "../validation/claim.schemas";

export class ApprovalService {
  constructor(private readonly claims: ClaimRepository) {}

  async listQueue(user: UserContext) {
    if (!["HOD", "MD"].includes(user.role)) {
      throw forbidden("Only HOD and MD approvers can view approval queues.");
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
    const [updated] = await Promise.all([
      this.claims.submitClaim(claimId, newStatus),
      this.claims.decideApprovalStep(step.stepId, "Approved", input.remarks ?? null)
    ]);

    await Promise.all([
      this.claims.createFinanceApprovalStep(claimId),
      this.claims.appendAuditLog({
        claimId,
        actorUserId: user.userId,
        actionType: user.role === "MD" ? "MD_APPROVE" : "HOD_APPROVE",
        preActionStatus: claim.status,
        postActionStatus: updated.status,
        auditRemarks: input.remarks ?? null,
        correlationId: user.correlationId
      })
    ]);

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

    const isFinanceStep = step.requiredApproverRole === "Finance" && ["Finance", "FinanceHOD"].includes(user.role);
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

    return {
      claimId,
      newStatus: updated.status,
      newStatusLabel: statusLabel(updated.status),
      rejectionReason: updated.rejectionReason,
      message: "Claim returned to claimant."
    };
  }
}
