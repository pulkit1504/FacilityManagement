import { describe, expect, it, vi } from "vitest";
import type { ClaimDetail, Employee, Site, UserContext } from "../src/server/domain/types";
import type { ClaimRepository } from "../src/server/repositories/claim-repository";
import { ClaimService } from "../src/server/services/claim-service";
import { ApprovalService } from "../src/server/services/approval-service";
import type { NotificationService } from "../src/server/services/notification-service";

const claimantUser: UserContext = { userId: "claimant-1", role: "Claimant", correlationId: "routing-test" };

function employee(employeeId: string, role: Employee["role"], directManagerId: string | null = null, isHod = false): Employee {
  return {
    employeeId,
    fullName: employeeId,
    email: `${employeeId}@example.com`,
    role,
    directManagerId,
    isHod,
    approvalThresholdAmount: 0,
    imprestAdvanceLimit: 0,
    bankAccountHolderName: employeeId,
    bankAccountNumber: "1234567890",
    bankIfsc: "HDFC0001234",
    bankName: "HDFC",
    isActive: true
  };
}

function draft(overrides: Partial<ClaimDetail> = {}): ClaimDetail {
  return {
    claimId: "claim-1",
    ticketId: "EXP-000001",
    submitterEmployeeId: "claimant-1",
    company: "Nimbus",
    claimKind: "Reimbursement",
    submissionMode: "SingleVoucher",
    proformaPeriodStart: null,
    proformaPeriodEnd: null,
    claimPeriodMonth: "2026-06-01",
    advanceClaimId: null,
    advanceAmount: 0,
    settledAmount: 0,
    advanceBalance: 0,
    status: "Draft",
    totalAmount: 12_000,
    advanceAdjustmentAmount: 0,
    finalPayableAmount: 12_000,
    netAdvanceLeftAmount: 0,
    siteId: "site-1",
    rejectionReason: null,
    physicalReceiptConfirmedAt: null,
    physicalReceiptConfirmedBy: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    lineItems: [{
      lineItemId: "line-1",
      claimId: "claim-1",
      expenseHead: "Travel",
      description: "Travel expense",
      amount: 12_000,
      transactionDate: "2026-06-01",
      paymentMode: "Cash",
      expenseTag: "BackendCTC",
      clientInvoiceNumber: null,
      vendorName: null,
      vendorInvoiceNumber: null,
      billableAmount: null,
      siteOrDepartment: "Operations",
      lineTicketId: null,
      invoiceValidationStatus: "NotApplicable",
      financeReviewStatus: "Pending",
      financeReviewRemarks: null,
      auditReviewStatus: "Pending",
      auditApprovedAmount: null,
      auditReviewRemarks: null,
      auditReviewedBy: null,
      auditReviewedAt: null,
      billingAlertCreated: false,
      siteId: null,
      missingReceiptFlag: false,
      sortOrder: 0,
      attachments: []
    }],
    approvalSteps: [],
    ...overrides
  };
}

function site(): Site {
  return {
    siteId: "site-1",
    siteName: "Site 1",
    siteAddress: null,
    serviceType: "Both",
    contractId: null,
    clientName: null,
    contractDescription: null,
    clusterHeadEmployeeId: "cluster-1",
    clusterHeadName: "cluster-1"
  };
}

function repository(claim: ClaimDetail, employees: Employee[], sites: Site[] = [site()]) {
  return {
    getClaimDetail: vi.fn().mockResolvedValue(claim),
    listPendingAdvances: vi.fn().mockResolvedValue([]),
    getEmployee: vi.fn(async (id: string) => employees.find((item) => item.employeeId === id) ?? null),
    listActiveSites: vi.fn().mockResolvedValue(sites),
    findManagingDirector: vi.fn().mockResolvedValue(employees.find((item) => item.role === "MD") ?? null),
    submitClaim: vi.fn().mockImplementation(async (_id: string, status: ClaimDetail["status"]) => ({ ...claim, status })),
    createApprovalSteps: vi.fn().mockResolvedValue(undefined),
    createFinanceApprovalStep: vi.fn().mockResolvedValue(undefined),
    appendAuditLog: vi.fn().mockResolvedValue(undefined),
    listEmployees: vi.fn().mockResolvedValue(employees)
  } as unknown as ClaimRepository;
}

const notifications = { enqueueAndSend: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationService;

describe("approval routing rules", () => {
  it("routes ordinary claimant expenses through Cluster Head then HOD", async () => {
    const claim = draft({ totalAmount: 5_000, lineItems: [{ ...draft().lineItems[0], amount: 5_000, paymentMode: "UPI" }] });
    const claims = repository(claim, [
      employee("claimant-1", "Claimant", "cluster-1"),
      employee("cluster-1", "ClusterHead", "hod-1"),
      employee("hod-1", "HOD", "md-1", true),
      employee("md-1", "MD")
    ]);

    await new ClaimService(claims, notifications).submitClaim(claim.claimId, claimantUser, true);

    expect(claims.createApprovalSteps).toHaveBeenCalledWith([
      expect.objectContaining({ stepOrder: 1, requiredApproverRole: "ClusterHead", assignedApproverId: "cluster-1" }),
      expect.objectContaining({ stepOrder: 2, requiredApproverRole: "HOD", assignedApproverId: "hod-1" })
    ]);
  });

  it("adds line-specific MD approval after Cluster Head and HOD for a cash line above Rs 10,000", async () => {
    const claim = draft();
    const claims = repository(claim, [
      employee("claimant-1", "Claimant", "cluster-1"),
      employee("cluster-1", "ClusterHead", "hod-1"),
      employee("hod-1", "HOD", "md-1", true),
      employee("md-1", "MD")
    ]);

    await new ClaimService(claims, notifications).submitClaim(claim.claimId, claimantUser, true);

    expect(claims.createApprovalSteps).toHaveBeenCalledWith([
      expect.objectContaining({ stepOrder: 1, requiredApproverRole: "ClusterHead", assignedApproverId: "cluster-1", lineItemId: null }),
      expect.objectContaining({ stepOrder: 2, requiredApproverRole: "HOD", assignedApproverId: "hod-1", lineItemId: null }),
      expect.objectContaining({ stepOrder: 3, requiredApproverRole: "MD", assignedApproverId: "md-1", lineItemId: "line-1" })
    ]);
  });

  it("does not add MD approval when total cash exceeds Rs 10,000 but no individual line does", async () => {
    const firstLine = { ...draft().lineItems[0], lineItemId: "line-1", amount: 6_000 };
    const secondLine = { ...firstLine, lineItemId: "line-2", amount: 6_000 };
    const claim = draft({ lineItems: [firstLine, secondLine] });
    const claims = repository(claim, [
      employee("claimant-1", "Claimant", "cluster-1"),
      employee("cluster-1", "ClusterHead", "hod-1"),
      employee("hod-1", "HOD", "md-1", true),
      employee("md-1", "MD")
    ]);

    await new ClaimService(claims, notifications).submitClaim(claim.claimId, claimantUser, true);

    expect(claims.createApprovalSteps).toHaveBeenCalledWith([
      expect.objectContaining({ requiredApproverRole: "ClusterHead" }),
      expect.objectContaining({ requiredApproverRole: "HOD" })
    ]);
  });

  it("routes final MD approval to Finance instead of payment processing", async () => {
    const claim = draft({
      status: "Submitted",
      approvalSteps: [{
        stepId: "md-step",
        claimId: "claim-1",
        lineItemId: "line-1",
        stepOrder: 3,
        requiredApproverRole: "MD",
        assignedApproverId: "md-1",
        decision: "Pending",
        decisionAt: null,
        remarks: null
      }]
    });
    const mdUser: UserContext = { userId: "md-1", role: "MD", correlationId: "md-routing-test" };
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      decideApprovalStep: vi.fn(),
      submitClaim: vi.fn().mockResolvedValue({ ...claim, status: "MdApproved" }),
      createFinanceApprovalStep: vi.fn(),
      appendAuditLog: vi.fn(),
      listEmployees: vi.fn().mockResolvedValue([employee("finance-1", "Finance")])
    } as unknown as ClaimRepository;

    const result = await new ApprovalService(claims, notifications).approveClaim(claim.claimId, {}, mdUser);

    expect(claims.submitClaim).toHaveBeenCalledWith(claim.claimId, "MdApproved");
    expect(claims.createFinanceApprovalStep).toHaveBeenCalledWith(claim.claimId);
    expect(result.nextAction).toBe("Routed to Finance team");
  });

  it("routes an HOD advance below Rs 4 lakh directly to Finance", async () => {
    const claim = draft({ claimKind: "Advance", submitterEmployeeId: "hod-1", ticketId: "ADV-000001", totalAmount: 300_000 });
    const hodUser: UserContext = { ...claimantUser, userId: "hod-1", role: "HOD" };
    const claims = repository(claim, [employee("hod-1", "HOD", "md-1", true), employee("md-1", "MD")], []);

    const result = await new ClaimService(claims, notifications).submitClaim(claim.claimId, hodUser, true);

    expect(claims.createApprovalSteps).not.toHaveBeenCalled();
    expect(claims.createFinanceApprovalStep).toHaveBeenCalledWith(claim.claimId);
    expect(result.assignedTo).toBe("Finance team");
  });

  it("requires MD approval for an advance above Rs 4 lakh", async () => {
    const claim = draft({ claimKind: "Advance", submitterEmployeeId: "hod-1", ticketId: "ADV-000002", totalAmount: 450_000 });
    const hodUser: UserContext = { ...claimantUser, userId: "hod-1", role: "HOD" };
    const claims = repository(claim, [employee("hod-1", "HOD", "md-1", true), employee("md-1", "MD")], []);

    await new ClaimService(claims, notifications).submitClaim(claim.claimId, hodUser, true);

    expect(claims.createApprovalSteps).toHaveBeenCalledWith([
      expect.objectContaining({ requiredApproverRole: "MD", assignedApproverId: "md-1" })
    ]);
  });
});
