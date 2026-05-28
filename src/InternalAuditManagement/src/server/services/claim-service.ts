import { conflict, forbidden, notFound } from "../errors/application-error";
import type { ClaimDetail, ExpenseClaim, UserContext } from "../domain/types";
import { statusLabel } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { CreateAdvanceRequestInput, CreateClaimInput, CreateLineItemInput } from "../validation/claim.schemas";

export class ClaimService {
  constructor(private readonly claims: ClaimRepository) {}

  async listClaims(user: UserContext) {
    const [claims, sites] = await Promise.all([
      this.claims.listClaimsForUser(user.userId, user.role),
      this.claims.listActiveSites()
    ]);
    const siteNames = new Map(sites.map((site) => [site.siteId, site.siteName]));

    return {
      items: claims.map((claim) => ({
        claimId: claim.claimId,
        ticketId: claim.ticketId,
        claimKind: claim.claimKind,
        submissionMode: claim.submissionMode,
        status: claim.status,
        statusLabel: statusLabel(claim.status),
        totalAmount: claim.totalAmount,
        siteId: claim.siteId,
        siteName: claim.siteId ? siteNames.get(claim.siteId) ?? claim.siteId : null,
        createdAt: claim.createdAt,
        updatedAt: claim.updatedAt
      })),
      nextCursor: null,
      totalCount: claims.length
    };
  }

  async createClaim(input: CreateClaimInput, user: UserContext) {
    if (!["Claimant", "HOD"].includes(user.role)) {
      throw forbidden("Only claimants and HODs can create expense claims.");
    }

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
      ticketId: claim.ticketId,
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

    await this.assertCanView(claim, user);

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
    this.assertLineItemDateIsValidForClaim(claim, input);

    return this.claims.addLineItem(claimId, input);
  }

  async listPendingAdvances(user: UserContext) {
    if (!["Claimant", "HOD", "Finance", "FinanceHOD"].includes(user.role)) {
      throw forbidden("You do not have access to imprest advances.");
    }

    const items = await this.claims.listPendingAdvances(user.userId, user.role);
    return {
      items,
      totalCount: items.length
    };
  }

  async createAdvanceRequest(input: CreateAdvanceRequestInput, user: UserContext) {
    if (!["Claimant", "HOD"].includes(user.role)) {
      throw forbidden("Only claimants and HODs can request an advance.");
    }

    const claim = await this.claims.createClaim({
      submitterEmployeeId: user.userId,
      claimKind: "Advance",
      submissionMode: "SingleVoucher",
      siteId: input.siteId,
      claimPeriodMonth: input.claimPeriodMonth ?? null,
      proformaPeriodStart: null,
      proformaPeriodEnd: null,
      advanceClaimId: null
    });

    await this.claims.addLineItem(claim.claimId, {
      expenseHead: "Imprest Advance",
      description: input.description,
      amount: input.amount,
      transactionDate: new Date().toISOString().slice(0, 10),
      paymentMode: "Cash",
      expenseTag: "BackendCTC",
      clientInvoiceNumber: null,
      vendorName: null,
      vendorInvoiceNumber: null,
      billableAmount: null,
      siteOrDepartment: input.siteId,
      lineTicketId: claim.ticketId,
      siteId: null,
      sortOrder: 0
    });

    await this.claims.appendAuditLog({
      claimId: claim.claimId,
      actorUserId: user.userId,
      actionType: "DRAFT_SAVED",
      preActionStatus: null,
      postActionStatus: "Draft",
      auditRemarks: "Imprest advance request draft created.",
      correlationId: user.correlationId
    });

    const submitted = await this.submitClaim(claim.claimId, user);
    return {
      claimId: claim.claimId,
      ticketId: claim.ticketId,
      ...submitted
    };
  }

  async updateLineItem(claimId: string, lineItemId: string, input: CreateLineItemInput, user: UserContext) {
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) {
      throw notFound("Claim was not found.");
    }

    this.assertOwnDraftClaim(claim, user);
    this.assertLineItemBelongsToClaim(claim, lineItemId);
    this.assertLineItemDateIsValidForClaim(claim, input);

    const updatedLine = await this.claims.updateLineItem(claimId, lineItemId, input);

    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: "DRAFT_SAVED",
      preActionStatus: claim.status,
      postActionStatus: claim.status,
      auditRemarks: `Line item ${lineItemId} updated in draft.`,
      correlationId: user.correlationId
    });

    return {
      lineItemId: updatedLine.lineItemId,
      missingReceiptFlag: updatedLine.missingReceiptFlag,
      message: "Line item updated."
    };
  }

  async deleteLineItem(claimId: string, lineItemId: string, user: UserContext) {
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) {
      throw notFound("Claim was not found.");
    }

    this.assertOwnDraftClaim(claim, user);
    this.assertLineItemBelongsToClaim(claim, lineItemId);

    await this.claims.deleteLineItem(claimId, lineItemId);

    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: "DRAFT_SAVED",
      preActionStatus: claim.status,
      postActionStatus: claim.status,
      auditRemarks: `Line item ${lineItemId} removed from draft.`,
      correlationId: user.correlationId
    });

    return {
      lineItemId,
      message: "Line item removed."
    };
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

    if (claim.claimKind === "Settlement") {
      const advance = claim.advanceClaimId ? await this.claims.getClaimDetail(claim.advanceClaimId) : null;
      if (!advance || advance.claimKind !== "Advance" || advance.status !== "PaymentReleased") {
        throw conflict("Settlement claims must be linked to a paid advance.");
      }

      if (claim.totalAmount > advance.advanceBalance) {
        throw conflict("Settlement amount cannot be greater than the open advance balance.", {
          errors: [`Open advance balance is Rs ${advance.advanceBalance.toLocaleString("en-IN")}.`]
        });
      }
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

    await Promise.all([
      this.claims.createApprovalSteps([
        {
          claimId,
          stepOrder: 1,
          requiredApproverRole: submitter.isHod ? "MD" : "HOD",
          assignedApproverId: firstApprover.employeeId
        }
      ]),
      this.claims.appendAuditLog({
        claimId,
        actorUserId: user.userId,
        actionType: "SUBMIT",
        preActionStatus: claim.status,
        postActionStatus: updatedClaim.status,
        correlationId: user.correlationId
      })
    ]);

    return {
      status: updatedClaim.status,
      statusLabel: statusLabel(updatedClaim.status),
      assignedTo: `${firstApprover.fullName} (${submitter.isHod ? "MD" : "HOD"})`,
      message: "Your claim has been submitted successfully."
    };
  }

  async reopenReturnedClaim(claimId: string, user: UserContext) {
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) {
      throw notFound("Claim was not found.");
    }

    if (claim.submitterEmployeeId !== user.userId) {
      throw forbidden("Only the original claimant can reopen this claim.");
    }

    if (claim.status !== "Rejected") {
      throw conflict("Only returned claims can be reopened for correction.");
    }

    const updatedClaim = await this.claims.reopenRejectedClaim(claimId);

    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: "DRAFT_SAVED",
      preActionStatus: claim.status,
      postActionStatus: updatedClaim.status,
      auditRemarks: "Returned claim reopened for correction.",
      correlationId: user.correlationId
    });

    return {
      claimId,
      status: updatedClaim.status,
      statusLabel: statusLabel(updatedClaim.status),
      message: "Claim reopened. Apply corrections and submit again."
    };
  }

  private async assertCanView(claim: ClaimDetail, user: UserContext) {
    if (["Finance", "FinanceHOD", "MD"].includes(user.role)) {
      return;
    }

    if (claim.submitterEmployeeId === user.userId) {
      return;
    }

    const pendingStep = claim.approvalSteps.find((step) => step.decision === "Pending");
    if (
      pendingStep &&
      pendingStep.assignedApproverId === user.userId &&
      pendingStep.requiredApproverRole === user.role
    ) {
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

  private assertLineItemBelongsToClaim(claim: ClaimDetail, lineItemId: string) {
    if (!claim.lineItems.some((item) => item.lineItemId === lineItemId)) {
      throw notFound("Line item was not found on this claim.");
    }
  }

  private assertLineItemDateIsValidForClaim(claim: ClaimDetail, input: CreateLineItemInput) {
    if (
      claim.submissionMode === "Proforma" &&
      (input.transactionDate < claim.proformaPeriodStart! || input.transactionDate > claim.proformaPeriodEnd!)
    ) {
      throw conflict("Line item date must fall within the declared proforma period.");
    }
  }

  private validateSubmissionGates(claim: ClaimDetail) {
    const errors: string[] = [];

    if (claim.lineItems.length === 0) {
      errors.push("At least one line item is required.");
    }

    if (claim.claimKind === "Settlement" && !claim.advanceClaimId) {
      errors.push("Settlement claims must be linked to a paid advance.");
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
