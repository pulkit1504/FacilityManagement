import { describe, expect, it, vi } from "vitest";
import type { ClaimDetail, Employee, UserContext } from "../src/server/domain/types";
import type { ClaimRepository } from "../src/server/repositories/claim-repository";
import { AuditService } from "../src/server/services/audit-service";
import type { NotificationService } from "../src/server/services/notification-service";

const auditor: UserContext = {
  userId: "emp-auditor-001",
  role: "Auditor",
  correlationId: "audit-test"
};

function employee(employeeId: string, role: Employee["role"]): Employee {
  return {
    employeeId,
    fullName: employeeId,
    email: `${employeeId}@example.com`,
    role,
    directManagerId: null,
    isHod: false,
    approvalThresholdAmount: 0,
    imprestAdvanceLimit: 0,
    bankAccountHolderName: null,
    bankAccountNumber: null,
    bankIfsc: null,
    bankName: null,
    isActive: true
  };
}

function auditPendingClaim(): ClaimDetail {
  return {
    claimId: "claim-1",
    ticketId: "EXP-000001",
    submitterEmployeeId: "claimant-1",
    claimKind: "Reimbursement",
    submissionMode: "SingleVoucher",
    proformaPeriodStart: null,
    proformaPeriodEnd: null,
    claimPeriodMonth: "2026-06-01",
    advanceClaimId: null,
    advanceAmount: 0,
    settledAmount: 0,
    advanceBalance: 0,
    status: "AuditPending",
    totalAmount: 2_000,
    advanceAdjustmentAmount: 0,
    finalPayableAmount: 2_000,
    netAdvanceLeftAmount: 0,
    siteId: "site-1",
    rejectionReason: null,
    physicalReceiptConfirmedAt: "2026-06-08T10:00:00.000Z",
    physicalReceiptConfirmedBy: "emp-finance-001",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T10:00:00.000Z",
    lineItems: [{
      lineItemId: "line-1",
      claimId: "claim-1",
      expenseHead: "Supplies",
      description: "Supplies",
      amount: 2_000,
      transactionDate: "2026-06-07",
      paymentMode: "UPI",
      expenseTag: "PendingBilling",
      clientInvoiceNumber: null,
      vendorName: "Vendor",
      vendorInvoiceNumber: "V-1",
      billableAmount: 2_000,
      siteOrDepartment: null,
      lineTicketId: null,
      invoiceValidationStatus: "NotApplicable",
      financeReviewStatus: "Accepted",
      financeReviewRemarks: null,
      auditReviewStatus: "Approved",
      auditApprovedAmount: 2_000,
      auditReviewRemarks: null,
      auditReviewedBy: "emp-auditor-001",
      auditReviewedAt: "2026-06-08T11:30:00.000Z",
      billingAlertCreated: false,
      siteId: "site-1",
      missingReceiptFlag: false,
      sortOrder: 0,
      attachments: []
    }],
    approvalSteps: [{
      stepId: "audit-step-1",
      claimId: "claim-1",
      stepOrder: 3,
      requiredApproverRole: "Auditor",
      assignedApproverId: "emp-auditor-001",
      decision: "Pending",
      decisionAt: null,
      remarks: null
    }]
  };
}

describe("Auditor receipt workflow", () => {
  const receivedLog = {
    auditId: "audit-receipt-1",
    claimId: "claim-1",
    actorUserId: auditor.userId,
    actorName: "Auditor",
    actionType: "AUDITOR_VOUCHERS_RECEIVED" as const,
    preActionStatus: "AuditPending",
    postActionStatus: "AuditPending",
    auditRemarks: "Voucher pack received.",
    correlationId: auditor.correlationId,
    actionTimestamp: "2026-06-08T11:00:00.000Z"
  };

  it("approves audit-pending claims back to FinanceConfirmed", async () => {
    const claim = auditPendingClaim();
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      decideApprovalStep: vi.fn(),
      submitClaim: vi.fn().mockResolvedValue({ ...claim, status: "FinanceConfirmed" }),
      createFinanceApprovalStep: vi.fn(),
      createBillingAlert: vi.fn().mockResolvedValue({ alertId: "alert-1" }),
      appendAuditLog: vi.fn(),
      listAuditLogForClaim: vi.fn().mockResolvedValue([receivedLog]),
      listEmployees: vi.fn().mockResolvedValue([employee("emp-finance-001", "Finance")])
    } as unknown as ClaimRepository;
    const notifications = { enqueueAndSend: vi.fn().mockResolvedValue({ status: "Sent" }) } as unknown as NotificationService;

    const result = await new AuditService(claims, notifications).approveClaim("claim-1", {
      remarks: "Evidence reviewed."
    }, auditor);

    expect(result.newStatus).toBe("FinanceConfirmed");
    expect(claims.decideApprovalStep).toHaveBeenCalledWith("audit-step-1", "Approved", "Evidence reviewed.");
    expect(claims.createFinanceApprovalStep).toHaveBeenCalledWith("claim-1");
    expect(claims.createBillingAlert).toHaveBeenCalledWith(expect.objectContaining({ claimId: "claim-1", lineItemId: "line-1" }));
    expect(notifications.enqueueAndSend).toHaveBeenCalledOnce();
  });

  it("creates billing alerts only for B2C - Pending Billing items after audit approval", async () => {
    const claim = auditPendingClaim();
    const pendingBillingLine = claim.lineItems[0];
    claim.lineItems = [
      pendingBillingLine,
      {
        ...pendingBillingLine,
        lineItemId: "line-contract-cost",
        expenseTag: "ContractPartCost",
        description: "Contract manpower cost",
        billableAmount: null,
        siteId: "site-1"
      },
      {
        ...pendingBillingLine,
        lineItemId: "line-backend-ctc",
        expenseTag: "BackendCTC",
        description: "Backend CTC payout",
        billableAmount: null,
        siteOrDepartment: "Operations",
        siteId: null
      }
    ];
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      decideApprovalStep: vi.fn(),
      submitClaim: vi.fn().mockResolvedValue({ ...claim, status: "FinanceConfirmed" }),
      createFinanceApprovalStep: vi.fn(),
      createBillingAlert: vi.fn().mockResolvedValue({ alertId: "alert-1" }),
      appendAuditLog: vi.fn(),
      listAuditLogForClaim: vi.fn().mockResolvedValue([receivedLog]),
      listEmployees: vi.fn().mockResolvedValue([employee("emp-finance-001", "Finance")])
    } as unknown as ClaimRepository;
    const notifications = { enqueueAndSend: vi.fn().mockResolvedValue({ status: "Sent" }) } as unknown as NotificationService;

    await new AuditService(claims, notifications).approveClaim("claim-1", {
      remarks: "Evidence reviewed."
    }, auditor);

    expect(claims.createBillingAlert).toHaveBeenCalledOnce();
    expect(claims.createBillingAlert).toHaveBeenCalledWith(expect.objectContaining({
      claimId: "claim-1",
      lineItemId: "line-1"
    }));
  });

  it("returns pending information requests to the claimant with the auditor reason", async () => {
    const claim = auditPendingClaim();
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      decideApprovalStep: vi.fn(),
      rejectClaim: vi.fn().mockResolvedValue({ ...claim, status: "Rejected" }),
      appendAuditLog: vi.fn(),
      listAuditLogForClaim: vi.fn().mockResolvedValue([receivedLog]),
      getEmployee: vi.fn().mockResolvedValue(employee("claimant-1", "Claimant"))
    } as unknown as ClaimRepository;
    const notifications = { enqueueAndSend: vi.fn().mockResolvedValue({ status: "Sent" }) } as unknown as NotificationService;

    const result = await new AuditService(claims, notifications).requestInformation("claim-1", {
      remarks: "Attach the missing signed voucher."
    }, auditor);

    expect(result.newStatus).toBe("Rejected");
    expect(claims.rejectClaim).toHaveBeenCalledWith("claim-1", "Pending information: Attach the missing signed voucher.");
    expect(claims.decideApprovalStep).toHaveBeenCalledWith("audit-step-1", "Rejected", "Pending information: Attach the missing signed voucher.");
    expect(notifications.enqueueAndSend).toHaveBeenCalledOnce();
  });

  it("requires the Auditor to mark vouchers received before making a decision", async () => {
    const claim = auditPendingClaim();
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      listAuditLogForClaim: vi.fn().mockResolvedValue([]),
      appendAuditLog: vi.fn()
    } as unknown as ClaimRepository;
    const service = new AuditService(claims, { enqueueAndSend: vi.fn() } as unknown as NotificationService);

    await expect(service.approveClaim("claim-1", { remarks: "Evidence reviewed." }, auditor)).rejects.toThrow(
      "Auditor must mark the voucher pack as received"
    );

    const result = await service.receiveVouchers("claim-1", auditor);
    expect(result.message).toContain("marked as received");
    expect(claims.appendAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "AUDITOR_VOUCHERS_RECEIVED",
      postActionStatus: "AuditPending"
    }));
  });

  it("records line-item audit approval with the approved amount", async () => {
    const claim = auditPendingClaim();
    claim.lineItems[0] = {
      ...claim.lineItems[0],
      auditReviewStatus: "Pending",
      auditApprovedAmount: null,
      auditReviewedAt: null,
      auditReviewedBy: null
    };
    const updatedLine = {
      ...claim.lineItems[0],
      auditReviewStatus: "Approved" as const,
      auditApprovedAmount: 1_750,
      auditReviewedBy: auditor.userId,
      auditReviewedAt: "2026-06-08T12:00:00.000Z"
    };
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      listAuditLogForClaim: vi.fn().mockResolvedValue([receivedLog]),
      reviewAuditLineItem: vi.fn().mockResolvedValue(updatedLine),
      appendAuditLog: vi.fn()
    } as unknown as ClaimRepository;

    const result = await new AuditService(claims, { enqueueAndSend: vi.fn() } as unknown as NotificationService).reviewLineItem("claim-1", "line-1", {
      decision: "Approved",
      approvedAmount: 1_750,
      remarks: "Partial disallowance documented."
    }, auditor);

    expect(result.lineItem.auditApprovedAmount).toBe(1_750);
    expect(claims.reviewAuditLineItem).toHaveBeenCalledWith("claim-1", "line-1", expect.objectContaining({
      decision: "Approved",
      approvedAmount: 1_750,
      reviewedByUserId: auditor.userId
    }));
    expect(claims.appendAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "AUDIT_LINE_APPROVE"
    }));
  });

  it("blocks claim audit approval until every line has an audit amount", async () => {
    const claim = auditPendingClaim();
    claim.lineItems[0] = {
      ...claim.lineItems[0],
      auditReviewStatus: "Pending",
      auditApprovedAmount: null
    };
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      listAuditLogForClaim: vi.fn().mockResolvedValue([receivedLog])
    } as unknown as ClaimRepository;

    await expect(new AuditService(claims, { enqueueAndSend: vi.fn() } as unknown as NotificationService).approveClaim("claim-1", {
      remarks: "Evidence reviewed."
    }, auditor)).rejects.toThrow("Approve every line item");
  });

  it("does not allow an audit-approved amount above the line amount", async () => {
    const claim = auditPendingClaim();
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      listAuditLogForClaim: vi.fn().mockResolvedValue([receivedLog]),
      reviewAuditLineItem: vi.fn()
    } as unknown as ClaimRepository;

    await expect(new AuditService(claims, { enqueueAndSend: vi.fn() } as unknown as NotificationService).reviewLineItem("claim-1", "line-1", {
      decision: "Approved",
      approvedAmount: 2_001,
      remarks: "Too high."
    }, auditor)).rejects.toThrow("cannot exceed");
    expect(claims.reviewAuditLineItem).not.toHaveBeenCalled();
  });

  it("lists the audit imprest register for auditors", async () => {
    const claims = {
      listAuditImprestRegister: vi.fn().mockResolvedValue([{ claimId: "claim-1", ticketId: "EXP-000001" }])
    } as unknown as ClaimRepository;

    const result = await new AuditService(claims, { enqueueAndSend: vi.fn() } as unknown as NotificationService).listImprestRegister(auditor);

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ ticketId: "EXP-000001" });
  });
});
