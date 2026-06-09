import { conflict, forbidden, notFound } from "../errors/application-error";
import type { ClaimDetail, ExpenseClaim, UserContext } from "../domain/types";
import { statusLabel } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { NotificationService } from "./notification-service";
import type { CreateAdvanceRequestInput, CreateClaimInput, CreateLineItemInput, UpdateBankDetailsInput, UpdateSettlementAdjustmentInput } from "../validation/claim.schemas";

export class ClaimService {
  constructor(
    private readonly claims: ClaimRepository,
    private readonly notifications: NotificationService
  ) {}

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
        advanceAdjustmentAmount: claim.advanceAdjustmentAmount,
        finalPayableAmount: claim.finalPayableAmount,
        netAdvanceLeftAmount: claim.netAdvanceLeftAmount,
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
    await this.assertAdvanceAdjustmentIsLinkedToPaidAdvance(claim);
    await this.assertInvoiceReferenceIsUnique(input);

    return this.claims.addLineItem(claimId, input);
  }

  async listPendingAdvances(user: UserContext) {
    if (!["Claimant", "ClusterHead", "HOD", "Finance"].includes(user.role)) {
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

    if (employee.imprestAdvanceLimit > 0) {
      const openAdvanceBalance = (await this.claims.listPendingAdvances(user.userId, user.role))
        .reduce((sum, advance) => sum + advance.advanceBalance, 0);
      const projectedAdvanceBalance = openAdvanceBalance + input.amount;
      if (projectedAdvanceBalance > employee.imprestAdvanceLimit) {
        throw conflict("Advance request exceeds the configured employee limit.", {
          errors: [
            `Open advances plus this request would be Rs ${projectedAdvanceBalance.toLocaleString("en-IN")} against an imprest limit of Rs ${employee.imprestAdvanceLimit.toLocaleString("en-IN")}.`
          ]
        });
      }
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
    await this.assertAdvanceAdjustmentIsLinkedToPaidAdvance(claim);
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

  async submitClaim(claimId: string, user: UserContext, outstandingAdvancesReviewed = false) {
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) {
      throw notFound("Claim was not found.");
    }

    this.assertOwnDraftClaim(claim, user);

    if (claim.claimKind !== "Advance") {
      const outstandingAdvances = await this.claims.listPendingAdvances(user.userId, user.role);
      if (outstandingAdvances.length > 0 && !outstandingAdvancesReviewed) {
        throw conflict("Review outstanding advances before submitting this claim.");
      }
    }

    const gateErrors = this.validateSubmissionGates(claim);
    if (gateErrors.length > 0) {
      throw conflict("Claim cannot be submitted until all gate checks pass.", { errors: gateErrors });
    }

    if (claim.advanceClaimId) {
      const advance = claim.advanceClaimId ? await this.claims.getClaimDetail(claim.advanceClaimId) : null;
      if (!advance || advance.claimKind !== "Advance" || advance.status !== "PaymentReleased") {
        throw conflict("Advance adjustments must be linked to a paid advance.");
      }
      if (await this.claims.activeSettlementExists(advance.claimId, claim.claimId)) {
        throw conflict("Another reimbursement is already adjusting this advance.");
      }
    }

    const submitter = await this.claims.getEmployee(claim.submitterEmployeeId);
    if (!submitter) {
      throw conflict("Submitter employee record is missing or inactive.");
    }

    const approvalSteps = await this.buildOperationalApprovalSteps(claim, submitter, user);
    const firstApprover = approvalSteps[0]?.approver;
    if (!firstApprover && claim.claimKind === "Advance") {
      const updatedClaim = await this.claims.submitClaim(claimId, "HodApproved");
      await Promise.all([
        this.claims.createFinanceApprovalStep(claimId),
        this.claims.appendAuditLog({
          claimId,
          actorUserId: user.userId,
          actionType: "SUBMIT",
          preActionStatus: claim.status,
          postActionStatus: updatedClaim.status,
          auditRemarks: "Advance routed directly to Finance because no operational approval is required.",
          correlationId: user.correlationId
        })
      ]);
      await this.notifyFinanceTeam(claim, claimId);
      return {
        status: updatedClaim.status,
        statusLabel: statusLabel(updatedClaim.status),
        assignedTo: "Finance team",
        message: "Your advance request has been submitted to Finance."
      };
    }
    if (!firstApprover) {
      throw conflict("No approver is configured for this claim.");
    }

    const nextStatus = "Submitted";
    const updatedClaim = await this.claims.submitClaim(claimId, nextStatus);

    await Promise.all([
      this.claims.createApprovalSteps(
        approvalSteps.map((step, index) => ({
          claimId,
          lineItemId: step.lineItemId ?? null,
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

    const steps: Array<{ role: "ClusterHead" | "HOD" | "MD"; approver: NonNullable<typeof submitter>; lineItemId?: string | null }> = [];
    const addStep = (role: "ClusterHead" | "HOD" | "MD", approver: NonNullable<typeof submitter>, lineItemId?: string | null) => {
      if (approver.employeeId === user.userId) {
        return;
      }

      if (!steps.some((step) => step.approver.employeeId === approver.employeeId && step.role === role && step.lineItemId === lineItemId)) {
        steps.push({ role, approver, lineItemId });
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

    let managerId = submitter.directManagerId;
    const visited = new Set<string>();
    while (managerId && !visited.has(managerId)) {
      visited.add(managerId);
      const manager = await this.claims.getEmployee(managerId);
      if (!manager) break;
      if (manager.role === "ClusterHead") addStep("ClusterHead", manager);
      if (manager.role === "HOD") {
        addStep("HOD", manager);
        break;
      }
      if (manager.role === "MD") {
        if (submitter.isHod && claim.claimKind !== "Advance") addStep("MD", manager);
        break;
      }
      managerId = manager.directManagerId;
    }

    if (submitter.isHod && claim.claimKind !== "Advance" && !steps.some((step) => step.role === "MD")) {
      const md = await this.claims.findManagingDirector();
      if (md) addStep("MD", md);
    }

    const highValueCashLines = claim.lineItems.filter((item) => item.paymentMode === "Cash" && item.amount > 10_000);
    if (claim.claimKind === "Reimbursement" && highValueCashLines.length > 0 && !steps.some((step) => step.role === "MD" && !step.lineItemId)) {
      const md = await this.claims.findManagingDirector();
      if (!md) throw conflict("No Managing Director is configured for cash line-item approval above Rs 10,000.");
      for (const line of highValueCashLines) {
        addStep("MD", md, line.lineItemId);
      }
    }

    if (claim.claimKind === "Advance" && claim.totalAmount > 400_000 && !steps.some((step) => step.role === "MD")) {
      const md = await this.claims.findManagingDirector();
      if (md) addStep("MD", md);
    }

    return steps;
  }

  private async notifyFinanceTeam(claim: ClaimDetail, claimId: string) {
    const employees = await this.claims.listEmployees();
    await Promise.all(
      employees
        .filter((employee) => employee.role === "Finance")
        .map((employee) =>
          this.notifyEmployee(
            employee,
            `Advance ${claim.ticketId} is ready for Finance review`,
            `Advance ${claim.ticketId} for Rs ${claim.totalAmount.toLocaleString("en-IN")} is ready for Finance review.`,
            claimId
          )
        )
    );
  }

  private async notifyEmployee(employee: NonNullable<Awaited<ReturnType<ClaimRepository["getEmployee"]>>>, subject: string, body: string, claimId: string) {
    await this.notifications.enqueueAndSend({
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

    let updatedClaim: ExpenseClaim;
    try {
      updatedClaim = await this.claims.reopenRejectedClaim(claimId);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const activeClaim = claim.advanceClaimId
          ? await this.claims.findActiveAdvanceAdjustment(claim.advanceClaimId, claim.claimId)
          : null;
        throw conflict(
          activeClaim
            ? `This returned claim cannot be prepared for correction because ${activeClaim.ticketId} is already active for the same advance. Continue with that claim or ask Finance to close it before correcting this one.`
            : "This returned claim cannot be prepared for correction because another active draft or submitted claim already exists for the same advance. Open the active claim or ask Finance to close the duplicate before correcting this one.",
          activeClaim
            ? {
                activeClaimId: activeClaim.claimId,
                activeTicketId: activeClaim.ticketId
              }
            : undefined
        );
      }
      throw error;
    }

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
    const approvalActors = await Promise.all(
      claim.approvalSteps.map((step) => step.assignedApproverId ? this.claims.getEmployee(step.assignedApproverId) : null)
    );
    const rows = [
      ...auditEntries.map((entry) => ({
        timestamp: entry.actionTimestamp,
        actor: entry.actorName ?? "",
        actorId: entry.actorUserId,
        action: entry.actionType,
        approvalRole: "",
        decision: "",
        fromStatus: entry.preActionStatus ?? "",
        toStatus: entry.postActionStatus,
        remarks: entry.auditRemarks ?? "",
        correlationId: entry.correlationId
      })),
      ...claim.approvalSteps
        .map((step, index) => ({
          timestamp: step.decisionAt!,
          actor: approvalActors[index]?.fullName ?? "",
          actorId: step.assignedApproverId ?? "",
          action: "APPROVAL_DECISION",
          approvalRole: step.requiredApproverRole,
          decision: step.decision,
          fromStatus: "",
          toStatus: "",
          remarks: step.remarks ?? "",
          correlationId: ""
        }))
        .filter((entry) => entry.timestamp)
    ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return toCsv(
      ["Timestamp", "Ticket", "Actor", "Actor ID", "Action", "Approval Role", "Decision", "From Status", "To Status", "Remarks", "Correlation ID"],
      rows.map((entry) => [
        entry.timestamp,
        claim.ticketId,
        entry.actor,
        entry.actorId,
        entry.action,
        entry.approvalRole,
        entry.decision,
        entry.fromStatus,
        entry.toStatus,
        entry.remarks,
        entry.correlationId
      ])
    );
  }

  async getProfile(user: UserContext) {
    if (!["Claimant", "ClusterHead", "HOD"].includes(user.role)) {
      throw forbidden("Profile self-service is available to Claimant, Cluster Head, and HOD users.");
    }
    const [employee, employees, sites, claims] = await Promise.all([
      this.claims.getEmployee(user.userId),
      this.claims.listEmployees(),
      this.claims.listActiveSites(),
      this.claims.listClaimsForUser(user.userId, user.role)
    ]);
    if (!employee) throw notFound("Employee profile was not found.");

    const linkedEmployees: typeof employees = [];
    const managerIds = new Set([user.userId]);
    for (let index = 0; index < employees.length; index += 1) {
      const reports = employees.filter((item) => item.directManagerId && managerIds.has(item.directManagerId));
      for (const report of reports) {
        if (!linkedEmployees.some((item) => item.employeeId === report.employeeId)) {
          linkedEmployees.push(report);
          managerIds.add(report.employeeId);
        }
      }
    }
    const linkedSiteIds = new Set(claims.map((claim) => claim.siteId).filter((siteId): siteId is string => Boolean(siteId)));
    if (user.role === "ClusterHead") {
      sites.filter((site) => site.clusterHeadEmployeeId === user.userId).forEach((site) => linkedSiteIds.add(site.siteId));
    }
    if (user.role === "HOD") {
      const reportIds = new Set(linkedEmployees.map((item) => item.employeeId));
      sites.filter((site) => site.clusterHeadEmployeeId && reportIds.has(site.clusterHeadEmployeeId)).forEach((site) => linkedSiteIds.add(site.siteId));
    }

    return {
      employee,
      linkedEmployees: linkedEmployees.map((item) => ({
        employeeId: item.employeeId,
        fullName: item.fullName,
        email: item.email,
        role: item.role,
        directManagerId: item.directManagerId
      })),
      linkedSites: sites.filter((site) => linkedSiteIds.has(site.siteId))
    };
  }

  async updateProfileBankDetails(input: UpdateBankDetailsInput, user: UserContext) {
    if (!["Claimant", "ClusterHead", "HOD"].includes(user.role)) {
      throw forbidden("You cannot update bank details from this profile.");
    }
    return {
      employee: await this.claims.updateEmployeeBankDetails(user.userId, input),
      message: "Bank account details updated."
    };
  }

  private async assertCanView(claim: ClaimDetail, user: UserContext) {
    if (["Finance", "MD"].includes(user.role)) {
      return;
    }

    if (claim.submitterEmployeeId === user.userId) {
      return;
    }

    if (claim.approvalSteps.some((step) => step.assignedApproverId === user.userId && step.requiredApproverRole === user.role)) {
      return;
    }

    const auditorCanReviewClaim = user.role === "Auditor" && claim.approvalSteps.some(
      (step) => step.requiredApproverRole === "Auditor"
        && step.decision === "Pending"
        && (!step.assignedApproverId || step.assignedApproverId === user.userId)
    );
    if (auditorCanReviewClaim) {
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
    const today = new Date().toISOString().slice(0, 10);
    const allowedAgeDays = claim.submissionMode === "Proforma" ? 50 : 20;
    const oldestAllowedDate = addUtcDays(today, -allowedAgeDays);

    if (input.transactionDate < oldestAllowedDate) {
      throw conflict(
        claim.submissionMode === "Proforma"
          ? "Periodic claim expense date cannot be more than 50 days older than today."
          : "Single voucher expense date cannot be more than 20 days older than today."
      );
    }

    if (
      claim.submissionMode === "Proforma" &&
      (input.transactionDate < claim.proformaPeriodStart! || input.transactionDate > claim.proformaPeriodEnd!)
    ) {
      throw conflict("Line item date must fall within the declared proforma period.");
    }

    if (claim.claimPeriodMonth) {
      const selectedMonth = claim.claimPeriodMonth.slice(0, 7);
      if (!input.transactionDate.startsWith(`${selectedMonth}-`)) {
        throw conflict("Line item date must fall within the expense month selected for the claim.");
      }
    }
  }

  private async assertAdvanceAdjustmentIsLinkedToPaidAdvance(claim: ClaimDetail) {
    if (!claim.advanceClaimId) {
      return;
    }

    const advance = claim.advanceClaimId ? await this.claims.getClaimDetail(claim.advanceClaimId) : null;
    if (!advance || advance.claimKind !== "Advance" || advance.status !== "PaymentReleased") {
      throw conflict("Advance adjustments must be linked to a paid advance.");
    }
  }

  async updateSettlementAdjustment(claimId: string, input: UpdateSettlementAdjustmentInput, user: UserContext) {
    const claim = await this.claims.getClaimDetail(claimId);
    if (!claim) {
      throw notFound("Claim was not found.");
    }

    this.assertOwnDraftClaim(claim, user);
    const advanceClaimId = input.advanceClaimId ?? claim.advanceClaimId;
    if (!advanceClaimId) {
      throw conflict("Select an outstanding advance before applying an adjustment.");
    }
    if (claim.advanceClaimId && claim.advanceClaimId !== advanceClaimId) {
      throw conflict("An advance adjustment cannot be switched to a different advance.");
    }
    if (claim.claimKind === "Reimbursement" && input.advanceAdjustmentAmount === 0) {
      throw conflict("Enter an advance adjustment amount greater than zero.");
    }

    const advance = await this.claims.getClaimDetail(advanceClaimId);
    if (
      !advance ||
      advance.claimKind !== "Advance" ||
      advance.status !== "PaymentReleased" ||
      advance.submitterEmployeeId !== claim.submitterEmployeeId
    ) {
      throw conflict("Advance adjustments must be linked to a paid advance.");
    }
    if (await this.claims.activeSettlementExists(advance.claimId, claim.claimId)) {
      throw conflict("Another reimbursement is already adjusting this advance.");
    }

    const maximumAdjustment = Math.min(claim.totalAmount, advance.advanceBalance);
    if (input.advanceAdjustmentAmount > maximumAdjustment) {
      throw conflict("Advance adjustment exceeds the available amount.", {
        errors: [`Enter an amount between Rs 0 and Rs ${maximumAdjustment.toLocaleString("en-IN")}.`]
      });
    }

    const updated = await this.claims.updateSettlementAdjustment(
      claimId,
      advance.claimId,
      claim.totalAmount,
      advance.advanceBalance,
      input.advanceAdjustmentAmount
    );
    await this.claims.appendAuditLog({
      claimId,
      actorUserId: user.userId,
      actionType: "DRAFT_SAVED",
      preActionStatus: claim.status,
      postActionStatus: claim.status,
      auditRemarks: `Advance adjustment set to Rs ${updated.advanceAdjustmentAmount.toLocaleString("en-IN")}.`,
      correlationId: user.correlationId
    });

    return {
      claimKind: updated.claimKind,
      advanceClaimId: updated.advanceClaimId,
      advanceAdjustmentAmount: updated.advanceAdjustmentAmount,
      finalPayableAmount: updated.finalPayableAmount,
      netAdvanceLeftAmount: updated.netAdvanceLeftAmount,
      message: "Advance adjustment saved."
    };
  }

  private async assertInvoiceReferenceIsUnique(input: CreateLineItemInput, excludingLineItemId?: string) {
    const clientInvoiceNumber = input.clientInvoiceNumber?.trim();
    if (clientInvoiceNumber) {
      if (await this.claims.invoiceReferenceExists(clientInvoiceNumber, { referenceType: "Client", excludingLineItemId })) {
        throw conflict("Duplicate invoice number detected.", {
          errors: [`Client invoice number ${clientInvoiceNumber} is already used on another claim line.`]
        });
      }
    }

    const vendorInvoiceNumber = input.vendorInvoiceNumber?.trim();
    if (vendorInvoiceNumber) {
      if (await this.claims.invoiceReferenceExists(vendorInvoiceNumber, {
        referenceType: "Vendor",
        vendorName: input.vendorName?.trim() || null,
        excludingLineItemId
      })) {
        throw conflict("Duplicate invoice number detected.", {
          errors: [`Vendor invoice number ${vendorInvoiceNumber} is already used for this vendor.`]
        });
      }
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

      if (item.expenseTag === "AlreadyBilled" && !item.vendorInvoiceNumber) {
        errors.push(`Line item ${item.lineItemId} requires a vendor invoice number.`);
      }

      if (item.expenseTag === "ContractPartCost" && !item.siteId) {
        errors.push(`Line item ${item.lineItemId} must be linked to a site.`);
      }
    }

    return errors;
  }
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
  );
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

function addUtcDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
