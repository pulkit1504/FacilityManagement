import { conflict, forbidden, notFound } from "../errors/application-error";
import type { ClaimDetail, ExpenseClaim, UserContext } from "../domain/types";
import { statusLabel } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { CreateClaimInput, CreateLineItemInput } from "../validation/claim.schemas";

export class ClaimService {
  constructor(private readonly claims: ClaimRepository) {}

  async listClaims(user: UserContext) {
    const claims = await this.claims.listClaimsForUser(user.userId, user.role);
    return {
      items: claims.map((claim) => ({
        claimId: claim.claimId,
        submissionMode: claim.submissionMode,
        status: claim.status,
        statusLabel: statusLabel(claim.status),
        totalAmount: claim.totalAmount,
        siteId: claim.siteId,
        createdAt: claim.createdAt,
        updatedAt: claim.updatedAt
      })),
      nextCursor: null,
      totalCount: claims.length
    };
  }

  async createClaim(input: CreateClaimInput, user: UserContext) {
    const claim = await this.claims.createClaim({
      ...input,
      submitterEmployeeId: user.userId
    });

    await this.claims.appendAuditLog({
      claimId: claim.claimId,
      actorUserId: user.userId,
      actionType: "DRAFT_SAVED",
      preActionStatus: null,
      postActionStatus: "Draft",
      correlationId: user.correlationId
    });

    return {
      claimId: claim.claimId,
      status: claim.status,
      statusLabel: statusLabel(claim.status),
      createdAt: claim.createdAt
    };
  }

  async getClaimDetail(claimId: string, user: UserContext): Promise<ClaimDetail & { statusLabel: string }> {
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) {
      throw notFound("Claim was not found.");
    }

    this.assertCanView(claim, user);

    return {
      ...claim,
      statusLabel: statusLabel(claim.status)
    };
  }

  async addLineItem(claimId: string, input: CreateLineItemInput, user: UserContext) {
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) {
      throw notFound("Claim was not found.");
    }

    this.assertOwnDraftClaim(claim, user);

    if (
      claim.submissionMode === "Proforma" &&
      (input.transactionDate < claim.proformaPeriodStart! || input.transactionDate > claim.proformaPeriodEnd!)
    ) {
      throw conflict("Line item date must fall within the declared proforma period.");
    }

    return this.claims.addLineItem(claimId, input);
  }

  async submitClaim(claimId: string, user: UserContext) {
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) {
      throw notFound("Claim was not found.");
    }

    this.assertOwnDraftClaim(claim, user);

    const gateErrors = this.validateSubmissionGates(claim);
    if (gateErrors.length > 0) {
      throw conflict("Claim cannot be submitted until all gate checks pass.", { errors: gateErrors });
    }

    const submitter = await this.claims.getEmployee(claim.submitterEmployeeId);
    if (!submitter) {
      throw conflict("Submitter employee record is missing or inactive.");
    }

    const firstApprover = submitter.isHod
      ? await this.claims.findManagingDirector()
      : submitter.directManagerId
        ? await this.claims.getEmployee(submitter.directManagerId)
        : null;

    if (!firstApprover) {
      throw conflict("No approver is configured for this employee.");
    }

    if (firstApprover.employeeId === user.userId) {
      throw conflict("A user cannot approve their own claim.");
    }

    const nextStatus = "Submitted";
    const updatedClaim = await this.claims.submitClaim(claimId, nextStatus);

    await this.claims.createApprovalSteps([
      {
        claimId,
        stepOrder: 1,
        requiredApproverRole: submitter.isHod ? "MD" : "HOD",
        assignedApproverId: firstApprover.employeeId
      }
    ]);

    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: "SUBMIT",
      preActionStatus: claim.status,
      postActionStatus: updatedClaim.status,
      correlationId: user.correlationId
    });

    return {
      status: updatedClaim.status,
      statusLabel: statusLabel(updatedClaim.status),
      assignedTo: `${firstApprover.fullName} (${submitter.isHod ? "MD" : "HOD"})`,
      message: "Your claim has been submitted successfully."
    };
  }

  private assertCanView(claim: ExpenseClaim, user: UserContext) {
    if (["Finance", "FinanceHOD", "MD"].includes(user.role)) {
      return;
    }

    if (claim.submitterEmployeeId === user.userId) {
      return;
    }

    throw forbidden("You can only view claims you are allowed to access.");
  }

  private assertOwnDraftClaim(claim: ExpenseClaim, user: UserContext) {
    if (claim.submitterEmployeeId !== user.userId) {
      throw forbidden("Only the original claimant can edit this claim.");
    }

    if (claim.status !== "Draft") {
      throw conflict("Only Draft claims can be edited.");
    }
  }

  private validateSubmissionGates(claim: ClaimDetail) {
    const errors: string[] = [];

    if (claim.lineItems.length === 0) {
      errors.push("At least one line item is required.");
    }

    if (claim.submissionMode === "Proforma" && claim.lineItems.length < 2) {
      errors.push("Itemized line-by-line breakdown is mandatory for Proforma submissions.");
    }

    for (const item of claim.lineItems) {
      if (item.expenseTag === "AlreadyBilled" && !item.clientInvoiceNumber) {
        errors.push(`Line item ${item.lineItemId} requires a client invoice number.`);
      }

      if (item.expenseTag === "ContractPartCost" && !item.siteId) {
        errors.push(`Line item ${item.lineItemId} must be linked to a site.`);
      }
    }

    return errors;
  }
}
