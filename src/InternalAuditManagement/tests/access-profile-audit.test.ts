import { describe, expect, it, vi } from "vitest";
import type { ClaimDetail, Employee, OverviewMetrics, Site, UserContext } from "../src/server/domain/types";
import type { ClaimRepository } from "../src/server/repositories/claim-repository";
import { ClaimService } from "../src/server/services/claim-service";
import { DashboardService } from "../src/server/services/dashboard-service";
import { FraudService } from "../src/server/services/fraud-service";
import type { NotificationService } from "../src/server/services/notification-service";

const claimant: UserContext = { userId: "claimant-1", role: "Claimant", correlationId: "access-test" };

function employee(id: string, role: Employee["role"], manager: string | null = null): Employee {
  return {
    employeeId: id,
    fullName: id,
    email: `${id}@example.com`,
    role,
    directManagerId: manager,
    isHod: role === "HOD",
    approvalThresholdAmount: 0,
    imprestAdvanceLimit: 0,
    bankAccountHolderName: id,
    bankAccountNumber: "1234567890",
    bankIfsc: "HDFC0001234",
    bankName: "HDFC",
    isActive: true
  };
}

const claim: ClaimDetail = {
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
  status: "Rejected",
  totalAmount: 1_000,
  advanceAdjustmentAmount: 0,
  finalPayableAmount: 1_000,
  netAdvanceLeftAmount: 0,
  siteId: "site-1",
  rejectionReason: "Correct receipt.",
  physicalReceiptConfirmedAt: null,
  physicalReceiptConfirmedBy: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
  lineItems: [],
  approvalSteps: [{
    stepId: "step-1",
    claimId: "claim-1",
    stepOrder: 1,
    requiredApproverRole: "HOD",
    assignedApproverId: "hod-1",
    decision: "Rejected",
    decisionAt: "2026-06-02T10:00:00.000Z",
    remarks: "Correct receipt."
  }]
};

describe("role visibility", () => {
  const sensitiveMetrics: OverviewMetrics = {
    pendingApprovals: 2,
    financeQueueCount: 0,
    activeBillingAlerts: 7,
    openFraudFlags: 4,
    billingRecoveryPct: 82,
    canViewBillingMetrics: false,
    canViewFraudFlags: false
  };

  it("masks billing and fraud metrics for claimant-facing roles", async () => {
    const service = new DashboardService({ getOverviewMetrics: vi.fn().mockResolvedValue(sensitiveMetrics) } as unknown as ClaimRepository);
    const result = await service.getOverview(claimant);

    expect(result.metrics).toMatchObject({
      activeBillingAlerts: 0,
      openFraudFlags: 0,
      billingRecoveryPct: null,
      canViewBillingMetrics: false,
      canViewFraudFlags: false
    });
  });

  it("blocks Finance users from fraud flags", async () => {
    const service = new FraudService({} as ClaimRepository);
    await expect(service.listFlags({ ...claimant, role: "Finance" })).rejects.toMatchObject({ status: 403 });
  });

  it("allows Auditor users to review fraud flags", async () => {
    const service = new FraudService({ listFraudFlags: vi.fn().mockResolvedValue([]) } as unknown as ClaimRepository);
    const result = await service.listFlags({ ...claimant, role: "Auditor", userId: "auditor-1" });

    expect(result.openFlagsCount).toBe(0);
  });
});

describe("profile and audit trail", () => {
  it("returns recursively linked employees and sites for an HOD", async () => {
    const hod = employee("hod-1", "HOD", "md-1");
    const clusterHead = employee("cluster-1", "ClusterHead", "hod-1");
    const report = employee("claimant-1", "Claimant", "cluster-1");
    const linkedSite: Site = {
      siteId: "site-1",
      siteName: "Site 1",
      siteAddress: null,
      serviceType: "Both",
      contractId: null,
      clientName: "Client",
      contractDescription: null,
      clusterHeadEmployeeId: "cluster-1",
      clusterHeadName: "cluster-1"
    };
    const claims = {
      getEmployee: vi.fn().mockResolvedValue(hod),
      listEmployees: vi.fn().mockResolvedValue([hod, clusterHead, report]),
      listActiveSites: vi.fn().mockResolvedValue([linkedSite]),
      listClaimsForUser: vi.fn().mockResolvedValue([])
    } as unknown as ClaimRepository;

    const result = await new ClaimService(claims, {} as NotificationService).getProfile({ ...claimant, userId: "hod-1", role: "HOD" });

    expect(result.linkedEmployees.map((item) => item.employeeId)).toEqual(["cluster-1", "claimant-1"]);
    expect(result.linkedSites.map((item) => item.siteId)).toEqual(["site-1"]);
  });

  it("includes approval decision timestamps and rejection remarks in audit CSV", async () => {
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      listAuditLogForClaim: vi.fn().mockResolvedValue([{
        auditId: "audit-1",
        claimId: claim.claimId,
        actorUserId: "claimant-1",
        actorName: "Claimant",
        actionType: "SUBMIT",
        preActionStatus: "Draft",
        postActionStatus: "Submitted",
        auditRemarks: null,
        correlationId: "correlation-1",
        actionTimestamp: "2026-06-01T10:00:00.000Z"
      }]),
      getEmployee: vi.fn().mockResolvedValue(employee("hod-1", "HOD"))
    } as unknown as ClaimRepository;

    const csv = await new ClaimService(claims, {} as NotificationService).exportClaimAuditTrail(claim.claimId, claimant);

    expect(csv).toContain("Approval Role,Decision");
    expect(csv).toContain("2026-06-02T10:00:00.000Z");
    expect(csv).toContain("HOD,Rejected");
    expect(csv).toContain("Correct receipt.");
  });

  it("exports an Excel-ready claim summary with claim and line-item details", async () => {
    const summaryClaim: ClaimDetail = {
      ...claim,
      status: "Submitted",
      totalAmount: 1_250,
      lineItems: [{
        lineItemId: "line-1",
        claimId: claim.claimId,
        expenseHead: "Repairs and Maintenance",
        description: "Replace lobby light",
        amount: 1_250,
        transactionDate: "2026-06-02",
        paymentMode: "UPI",
        expenseTag: "AlreadyBilled",
        clientInvoiceNumber: "CLIENT-100",
        vendorName: "Demo Vendor",
        vendorInvoiceNumber: "VENDOR-100",
        billableAmount: null,
        siteOrDepartment: null,
        lineTicketId: null,
        invoiceValidationStatus: "PendingErpValidation",
        siteId: null,
        billingAlertCreated: false,
        missingReceiptFlag: false,
        financeReviewStatus: "Pending",
        financeReviewRemarks: null,
        sortOrder: 0,
        attachments: []
      }]
    };
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(summaryClaim)
    } as unknown as ClaimRepository;

    const result = await new ClaimService(claims, {} as NotificationService).exportClaimSummary(summaryClaim.claimId, claimant);

    expect(result.ticketId).toBe("EXP-000001");
    expect(result.csv).toContain("Ticket,Status,Claim Type");
    expect(result.csv).toContain("Replace lobby light");
    expect(result.csv).toContain("Demo Vendor,VENDOR-100,CLIENT-100");
    expect(result.csv).toContain("1250,Attached");
  });

  it("allows an Auditor to view and export summaries for exception claims", async () => {
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim)
    } as unknown as ClaimRepository;
    const auditor = { ...claimant, role: "Auditor" as const, userId: "auditor-1" };
    const service = new ClaimService(claims, {} as NotificationService);

    await expect(service.getClaimDetail(claim.claimId, auditor)).resolves.toMatchObject({ ticketId: "EXP-000001" });
    await expect(service.exportClaimSummary(claim.claimId, auditor)).resolves.toMatchObject({ ticketId: "EXP-000001" });
  });
});
