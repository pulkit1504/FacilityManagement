import { describe, expect, it, vi } from "vitest";
import type { ClaimDetail, Employee, UserContext } from "../src/server/domain/types";
import type { ClaimRepository } from "../src/server/repositories/claim-repository";
import { ApprovalService } from "../src/server/services/approval-service";
import type { NotificationService } from "../src/server/services/notification-service";
import { rejectClaimSchema } from "../src/server/validation/claim.schemas";

const approver: UserContext = {
  userId: "hod-1",
  role: "HOD",
  correlationId: "test-correlation"
};

function settlementClaim(): ClaimDetail {
  return {
    claimId: "settlement-1",
    ticketId: "SET-TEST",
    submitterEmployeeId: "claimant-1",
    claimKind: "Settlement",
    submissionMode: "SingleVoucher",
    proformaPeriodStart: null,
    proformaPeriodEnd: null,
    claimPeriodMonth: "2026-06",
    advanceClaimId: "advance-1",
    advanceAmount: 0,
    settledAmount: 0,
    advanceBalance: 0,
    status: "Submitted",
    totalAmount: 1_000,
    advanceAdjustmentAmount: 1_000,
    finalPayableAmount: 0,
    netAdvanceLeftAmount: 0,
    siteId: "site-1",
    rejectionReason: null,
    physicalReceiptConfirmedAt: null,
    physicalReceiptConfirmedBy: null,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    lineItems: [],
    approvalSteps: [{
      stepId: "step-1",
      claimId: "settlement-1",
      stepOrder: 1,
      requiredApproverRole: "HOD",
      assignedApproverId: "hod-1",
      decision: "Pending",
      decisionAt: null,
      remarks: null
    }]
  };
}

function claimant(): Employee {
  return {
    employeeId: "claimant-1",
    fullName: "Claimant",
    email: "claimant@example.com",
    role: "Claimant",
    directManagerId: "hod-1",
    isHod: false,
    approvalThresholdAmount: 0,
    imprestAdvanceLimit: 0,
    bankAccountHolderName: "Claimant",
    bankAccountNumber: "1234567890",
    bankIfsc: "HDFC0001234",
    bankName: "HDFC",
    isActive: true
  };
}

describe("Imprest settlement rejection remarks", () => {
  it("requires meaningful remarks", () => {
    expect(rejectClaimSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(rejectClaimSchema.safeParse({ reason: "no" }).success).toBe(false);
    expect(rejectClaimSchema.parse({ reason: "Receipt amount does not match." })).toEqual({
      reason: "Receipt amount does not match."
    });
  });

  it("stores remarks in the claim, approval history, audit trail, and notification", async () => {
    const claim = settlementClaim();
    const reason = "Receipt amount does not match.";
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(claim),
      rejectClaim: vi.fn().mockResolvedValue({ ...claim, status: "Rejected", rejectionReason: reason }),
      decideApprovalStep: vi.fn().mockResolvedValue(undefined),
      appendAuditLog: vi.fn().mockResolvedValue(undefined),
      getEmployee: vi.fn().mockResolvedValue(claimant())
    } as unknown as ClaimRepository;
    const notifications = {
      enqueueAndSend: vi.fn().mockResolvedValue(undefined)
    } as unknown as NotificationService;

    await new ApprovalService(claims, notifications).rejectClaim(claim.claimId, { reason }, approver);

    expect(claims.rejectClaim).toHaveBeenCalledWith(claim.claimId, reason);
    expect(claims.decideApprovalStep).toHaveBeenCalledWith("step-1", "Rejected", reason);
    expect(claims.appendAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "REJECT",
      auditRemarks: reason
    }));
    expect(notifications.enqueueAndSend).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining(reason)
    }));
  });
});
