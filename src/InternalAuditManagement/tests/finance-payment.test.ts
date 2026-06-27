import { describe, expect, it, vi } from "vitest";
import type { ClaimDetail, Employee, UserContext } from "../src/server/domain/types";
import type { ClaimRepository } from "../src/server/repositories/claim-repository";
import { FinanceService } from "../src/server/services/finance-service";
import type { NotificationService } from "../src/server/services/notification-service";

const financeUser: UserContext = {
  userId: "emp-finance-001",
  role: "Finance",
  correlationId: "test-correlation"
};

function advanceClaim(): ClaimDetail {
  return {
    claimId: "claim-1",
    ticketId: "ADV-TEST",
    submitterEmployeeId: "claimant-1",
    company: "Nimbus",
    claimKind: "Advance",
    submissionMode: "SingleVoucher",
    proformaPeriodStart: null,
    proformaPeriodEnd: null,
    claimPeriodMonth: null,
    advanceClaimId: null,
    advanceAmount: 1_000,
    settledAmount: 0,
    advanceBalance: 1_000,
    status: "HodApproved",
    totalAmount: 1_000,
    advanceAdjustmentAmount: 0,
    finalPayableAmount: 1_000,
    netAdvanceLeftAmount: 0,
    siteId: "site-1",
    rejectionReason: null,
    physicalReceiptConfirmedAt: null,
    physicalReceiptConfirmedBy: null,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    lineItems: [],
    approvalSteps: []
  };
}

function approvedReimbursementClaim(): ClaimDetail {
  return {
    ...advanceClaim(),
    claimId: "claim-reimbursement-1",
    ticketId: "EXP-TEST",
    claimKind: "Reimbursement",
    advanceAmount: 0,
    advanceBalance: 0,
    status: "HodApproved",
    totalAmount: 1_500,
    finalPayableAmount: 1_500,
    lineItems: [{
      lineItemId: "line-1",
      claimId: "claim-reimbursement-1",
      expenseHead: "Supplies",
      description: "Office supplies",
      amount: 1_500,
      transactionDate: "2026-06-06",
      paymentMode: "UPI",
      expenseTag: "PendingBilling",
      clientInvoiceNumber: null,
      vendorName: "Vendor",
      vendorInvoiceNumber: "V-1",
      billableAmount: 1_500,
      siteOrDepartment: null,
      lineTicketId: null,
      invoiceValidationStatus: "NotApplicable",
      financeReviewStatus: "Accepted",
      financeReviewRemarks: null,
      auditReviewStatus: "Approved",
      auditApprovedAmount: 1_500,
      auditReviewRemarks: null,
      auditReviewedBy: "emp-auditor-001",
      auditReviewedAt: "2026-06-06T12:00:00.000Z",
      billingAlertCreated: false,
      siteId: "site-1",
      missingReceiptFlag: false,
      sortOrder: 0,
      attachments: []
    }],
    approvalSteps: [{
      stepId: "finance-step-1",
      claimId: "claim-reimbursement-1",
      stepOrder: 2,
      requiredApproverRole: "Finance",
      assignedApproverId: null,
      decision: "Pending",
      decisionAt: null,
      remarks: null
    }]
  };
}

function employee(bankReady: boolean): Employee {
  return {
    employeeId: "claimant-1",
    fullName: "Claimant",
    email: "claimant@example.com",
    role: "Claimant",
    directManagerId: null,
    isHod: false,
    approvalThresholdAmount: 0,
    imprestAdvanceLimit: 0,
    bankAccountHolderName: bankReady ? "Claimant" : null,
    bankAccountNumber: bankReady ? "1234567890" : null,
    bankIfsc: bankReady ? "HDFC0001234" : null,
    bankName: bankReady ? "HDFC" : null,
    isActive: true
  };
}

function auditorEmployee(): Employee {
  return {
    ...employee(false),
    employeeId: "emp-auditor-001",
    fullName: "Internal Auditor",
    email: "auditor@example.com",
    role: "Auditor"
  };
}

function repository(bankReady: boolean) {
  const claim = advanceClaim();
  return {
    getClaimDetail: vi.fn().mockResolvedValue(claim),
    getPendingApprovalStep: vi.fn().mockResolvedValue(null),
    getEmployee: vi.fn().mockResolvedValue(employee(bankReady)),
    releasePaymentAtomically: vi.fn().mockResolvedValue({ ...claim, status: "PaymentReleased" })
  } as unknown as ClaimRepository;
}

describe("Finance payment release", () => {
  it("routes confirmed physical receipts to Auditor before payment release", async () => {
    const claim = approvedReimbursementClaim();
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      confirmPhysicalReceipt: vi.fn().mockResolvedValue({ ...claim, physicalReceiptConfirmedAt: "2026-06-08T10:00:00.000Z" }),
      getPendingApprovalStep: vi.fn().mockResolvedValue(claim.approvalSteps[0]),
      decideApprovalStep: vi.fn(),
      submitClaim: vi.fn().mockResolvedValue({ ...claim, status: "AuditPending" }),
      createAuditorApprovalStep: vi.fn(),
      appendAuditLog: vi.fn(),
      listEmployees: vi.fn().mockResolvedValue([auditorEmployee()])
    } as unknown as ClaimRepository;
    const notification = { enqueueAndSend: vi.fn().mockResolvedValue({ status: "Sent" }) } as unknown as NotificationService;
    const service = new FinanceService(claims, notification);

    const result = await service.confirmPhysicalReceipt("claim-reimbursement-1", {
      physicalReceiptDate: "2026-06-08",
      physicalReceiptTime: "15:30",
      receivedByName: "Finance desk"
    }, financeUser);

    expect(result.message).toContain("Auditor");
    expect(claims.submitClaim).toHaveBeenCalledWith("claim-reimbursement-1", "AuditPending");
    expect(claims.createAuditorApprovalStep).toHaveBeenCalledWith("claim-reimbursement-1");
    expect(claims.decideApprovalStep).toHaveBeenCalledWith("finance-step-1", "Approved", "Physical voucher received by Finance desk");
    expect(notification.enqueueAndSend).toHaveBeenCalledOnce();
  });

  it("does not send a partial voucher pack to Audit", async () => {
    const claim = approvedReimbursementClaim();
    claim.lineItems[0].financeReviewStatus = "Pending";
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      confirmPhysicalReceipt: vi.fn(),
      createAuditorApprovalStep: vi.fn()
    } as unknown as ClaimRepository;
    const service = new FinanceService(claims, { enqueueAndSend: vi.fn() } as unknown as NotificationService);

    await expect(service.confirmPhysicalReceipt("claim-reimbursement-1", {
      physicalReceiptDate: "2026-06-08",
      physicalReceiptTime: "15:30",
      receivedByName: "Finance desk"
    }, financeUser)).rejects.toThrow("Complete Finance review before confirming the voucher pack.");

    expect(claims.confirmPhysicalReceipt).not.toHaveBeenCalled();
    expect(claims.createAuditorApprovalStep).not.toHaveBeenCalled();
  });

  it("requires Auditor approval before releasing reimbursement payment", async () => {
    const claim = approvedReimbursementClaim();
    claim.status = "FinanceConfirmed";
    claim.physicalReceiptConfirmedAt = "2026-06-08T10:00:00.000Z";
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim)
    } as unknown as ClaimRepository;
    const service = new FinanceService(claims, { enqueueAndSend: vi.fn() } as unknown as NotificationService);

    await expect(service.releasePayment(claim.claimId, financeUser)).rejects.toThrow(
      "Auditor approval is required before payment can be released."
    );
  });

  it("blocks payment when beneficiary details are incomplete", async () => {
    const service = new FinanceService(repository(false), {
      enqueueAndSend: vi.fn()
    } as unknown as NotificationService);

    await expect(service.releasePayment("claim-1", financeUser)).rejects.toThrow(
      "Beneficiary bank details are required before payment release."
    );
  });

  it("sends a payment notification and reports delivery failure accurately", async () => {
    const notification = {
      enqueueAndSend: vi.fn().mockResolvedValue({ status: "Failed" })
    } as unknown as NotificationService;
    const service = new FinanceService(repository(true), notification);

    const result = await service.releasePayment("claim-1", financeUser);

    expect(result.message).toContain("notification delivery failed");
    expect(notification.enqueueAndSend).toHaveBeenCalledOnce();
  });

  it("uses one atomic repository operation before notifying the claimant", async () => {
    const claims = repository(true);
    const service = new FinanceService(claims, {
      enqueueAndSend: vi.fn().mockResolvedValue({ status: "Sent" })
    } as unknown as NotificationService);

    await service.releasePayment("claim-1", financeUser);

    expect(claims.releasePaymentAtomically).toHaveBeenCalledWith("claim-1", financeUser.userId, financeUser.correlationId);
  });

  it("does not notify the claimant when the atomic payment transaction fails", async () => {
    const claims = repository(true);
    claims.releasePaymentAtomically = vi.fn().mockRejectedValue(new Error("Atomic payment failed"));
    const notification = {
      enqueueAndSend: vi.fn()
    } as unknown as NotificationService;
    const service = new FinanceService(claims, notification);

    await expect(service.releasePayment("claim-1", financeUser)).rejects.toThrow("Atomic payment failed");

    expect(notification.enqueueAndSend).not.toHaveBeenCalled();
  });
});
