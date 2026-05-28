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
    if (!["Claimant", "ClusterHead", "HOD"].includes(user.role)) {
      throw forbidden("Only claimants, Cluster Heads, and HODs can create expense claims.");
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
    await this.assertSettlementAmountWithinAdvance(claim, input.amount);
    await this.assertInvoiceReferenceIsUnique(input);

    return this.claims.addLineItem(claimId, input);
  }

  async listPendingAdvances(user: UserContext) {
    if (!["Claimant", "ClusterHead", "HOD", "Finance", "FinanceHOD"].includes(user.role)) {
      throw forbidden("You do not have access to imprest advances.");
    }

    const items = await this.claims.listPendingAdvances(user.userId, user.role);
    return {
      items,
      totalCount: items.length
    };
  }

  async createAdvanceRequest(input: CreateAdvanceRequestInput, user: UserContext) {
    if (!["Claimant", "ClusterHead", "HOD"].includes(user.role)) {
      throw forbidden("Only claimants, Cluster Heads, and HODs can request an advance.");
    }

    const employee = await this.claims.getEmployee(user.userId);
    if (!employee) {
      throw conflict("Employee profile is missing or inactive.");
    }

    if (employee.imprestAdvanceLimit > 0 && input.amount > employee.imprestAdvanceLimit) {
      throw conflict("Advance request exceeds the configured employee limit.", {
        errors: [`Configured advance limit is Rs ${employee.imprestAdvanceLimit.toLocaleString("en-IN")}.`]
      });
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
      lineTicketId: null,
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
    const existingLine = claim.lineItems.find((item) => item.lineItemId === lineItemId);
    const currentAmount = existingLine?.amount ?? 0;
    await this.assertSettlementAmountWithinAdvance(claim, input.amount, currentAmount);
    await this.assertInvoiceReferenceIsUnique(input, lineItemId);

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

    const approvalSteps = await this.buildOperationalApprovalSteps(claim, submitter, user);
    const firstApprover = approvalSteps[0]?.approver;
    if (!firstApprover) {
      throw conflict("No approver is configured for this claim.");
    }

    const nextStatus = "Submitted";
    const updatedClaim = await this.claims.submitClaim(claimId, nextStatus);

    await Promise.all([
      this.claims.createApprovalSteps(
        approvalSteps.map((step, index) => ({
          claimId,
          stepOrder: index + 1,
          requiredApproverRole: step.role,
          assignedApproverId: step.approver.employeeId
        }))
      ),
      this.claims.appendAuditLog({
        claimId,
        actorUserId: user.userId,
        actionType: "SUBMIT",
        preActionStatus: claim.status,
        postActionStatus: updatedClaim.status,
        correlationId: user.correlationId
      })
    ]);

    await this.notifyEmployee(
      firstApprover,
      `Claim ${claim.ticketId} is pending your approval`,
      `Claim ${claim.ticketId} for Rs ${claim.totalAmount.toLocaleString("en-IN")} has been submitted for your approval.`,
      claimId
    );

    return {
      status: updatedClaim.status,
      statusLabel: statusLabel(updatedClaim.status),
      assignedTo: `${firstApprover.fullName} (${approvalSteps[0].role})`,
      message: "Your claim has been submitted successfully."
    };
  }

  private async buildOperationalApprovalSteps(claim: ClaimDetail, submitter: Awaited<ReturnType<ClaimRepository["getEmployee"]>>, user: UserContext) {
    if (!submitter) {
      throw conflict("Submitter employee record is missing or inactive.");
    }

    const steps: Array<{ role: "ClusterHead" | "HOD" | "MD"; approver: NonNullable<typeof submitter> }> = [];
    const addStep = (role: "ClusterHead" | "HOD" | "MD", approver: NonNullable<typeof submitter>) => {
      if (approver.employeeId === user.userId) {
        return;
      }

      if (!steps.some((step) => step.approver.employeeId === approver.employeeId && step.role === role)) {
        steps.push({ role, approver });
      }
    };

    const sites = await this.claims.listActiveSites();
    const site = claim.siteId ? sites.find((item) => item.siteId === claim.siteId) : null;
    if (site?.clusterHeadEmployeeId) {
      const clusterHead = await this.claims.getEmployee(site.clusterHeadEmployeeId);
      if (clusterHead?.role === "ClusterHead") {
        addStep("ClusterHead", clusterHead);
      }
    }

    if (submitter.isHod) {
      const md = await this.claims.findManagingDirector();
      if (md) addStep("MD", md);
    } else if (submitter.directManagerId) {
      const manager = await this.claims.getEmployee(submitter.directManagerId);
      if (manager) {
        if (manager.role === "ClusterHead") {
          addStep("ClusterHead", manager);
          if (manager.directManagerId) {
            const hodManager = await this.claims.getEmployee(manager.directManagerId);
            if (hodManager) {
              addStep(hodManager.role === "MD" ? "MD" : "HOD", hodManager);
            }
          }
        } else {
          addStep(manager.role === "MD" ? "MD" : "HOD", manager);
        }
      }
    }

    const cashTotal = claim.lineItems
      .filter((item) => item.paymentMode === "Cash")
      .reduce((sum, item) => sum + item.amount, 0);
    if (cashTotal > 10_000 && !steps.some((step) => step.role === "MD")) {
      const md = await this.claims.findManagingDirector();
      if (md) addStep("MD", md);
    }

    if (steps.length === 0) {
      throw conflict("No approver is configured for this employee or site.");
    }

    return steps;
  }

  private async notifyEmployee(employee: NonNullable<Awaited<ReturnType<ClaimRepository["getEmployee"]>>>, subject: string, body: string, claimId: string) {
    await this.claims.enqueueNotification({
      recipientEmployeeId: employee.employeeId,
      recipientEmail: employee.email,
      subject,
      body,
      relatedClaimId: claimId
    });
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

  async exportClaimAuditTrail(claimId: string, user: UserContext) {
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) {
      throw notFound("Claim was not found.");
    }

    await this.assertCanView(claim, user);

    const auditEntries = await this.claims.listAuditLogForClaim(claimId);
    return toCsv(
      ["Timestamp", "Ticket", "Actor", "Actor ID", "Action", "From Status", "To Status", "Remarks", "Correlation ID"],
      auditEntries.map((entry) => [
        entry.actionTimestamp,
        claim.ticketId,
        entry.actorName ?? "",
        entry.actorUserId,
        entry.actionType,
        entry.preActionStatus ?? "",
        entry.postActionStatus,
        entry.auditRemarks ?? "",
        entry.correlationId
      ])
    );
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

  private async assertSettlementAmountWithinAdvance(claim: ClaimDetail, nextLineAmount: number, replacedLineAmount = 0) {
    if (claim.claimKind !== "Settlement") {
      return;
    }

    const advance = claim.advanceClaimId ? await this.claims.getClaimDetail(claim.advanceClaimId) : null;
    if (!advance || advance.claimKind !== "Advance" || advance.status !== "PaymentReleased") {
      throw conflict("Settlement claims must be linked to a paid advance.");
    }

    const existingDraftTotal = claim.lineItems.reduce((sum, item) => sum + item.amount, 0);
    const proposedTotal = existingDraftTotal - replacedLineAmount + nextLineAmount;
    if (proposedTotal > advance.advanceBalance) {
      throw conflict("Settlement amount cannot be greater than the open advance balance.", {
        errors: [
          `Open advance balance is Rs ${advance.advanceBalance.toLocaleString("en-IN")}.`,
          `Current draft total after this line would be Rs ${proposedTotal.toLocaleString("en-IN")}.`
        ]
      });
    }
  }

  private async assertInvoiceReferenceIsUnique(input: CreateLineItemInput, excludingLineItemId?: string) {
    const invoiceNumber = input.clientInvoiceNumber?.trim() || input.vendorInvoiceNumber?.trim();
    if (!invoiceNumber) return;

    if (await this.claims.invoiceReferenceExists(invoiceNumber, excludingLineItemId)) {
      throw conflict("Duplicate invoice number detected.", {
        errors: [`Invoice number ${invoiceNumber} is already used on another claim line.`]
      });
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
