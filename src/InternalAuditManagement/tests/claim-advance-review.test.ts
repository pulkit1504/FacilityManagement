import { describe, expect, it, vi } from "vitest";
import type { ClaimDetail, UserContext } from "../src/server/domain/types";
import type { ClaimRepository } from "../src/server/repositories/claim-repository";
import { ClaimService } from "../src/server/services/claim-service";
import type { NotificationService } from "../src/server/services/notification-service";

const user: UserContext = {
  userId: "claimant-1",
  role: "Claimant",
  correlationId: "advance-review-test"
};

function claim(overrides: Partial<ClaimDetail>): ClaimDetail {
  return {
    claimId: "claim-1",
    ticketId: "EXP-001",
    submitterEmployeeId: user.userId,
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
    totalAmount: 7_000,
    advanceAdjustmentAmount: 0,
    finalPayableAmount: 0,
    netAdvanceLeftAmount: 0,
    siteId: "site-1",
    rejectionReason: null,
    physicalReceiptConfirmedAt: null,
    physicalReceiptConfirmedBy: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    lineItems: [],
    approvalSteps: [],
    ...overrides
  };
}

describe("new claim advance review", () => {
  it("requires outstanding advances to be reviewed before final submission", async () => {
    const draft = claim({});
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(draft),
      listPendingAdvances: vi.fn().mockResolvedValue([{ claimId: "advance-1" }])
    } as unknown as ClaimRepository;
    const service = new ClaimService(claims, {} as NotificationService);

    await expect(service.submitClaim(draft.claimId, user)).rejects.toMatchObject({
      message: "Review outstanding advances before submitting this claim."
    });
  });

  it("links a reimbursement draft to the selected outstanding advance", async () => {
    const draft = claim({});
    const advance = claim({
      claimId: "00000000-0000-4000-8000-000000000001",
      ticketId: "ADV-001",
      claimKind: "Advance",
      status: "PaymentReleased",
      advanceAmount: 5_000,
      advanceBalance: 5_000
    });
    const updated = claim({
      claimKind: "Reimbursement",
      advanceClaimId: advance.claimId,
      advanceAdjustmentAmount: 2_000,
      finalPayableAmount: 5_000,
      netAdvanceLeftAmount: 3_000
    });
    const claims = {
      getClaimDetail: vi.fn(async (claimId: string) => claimId === draft.claimId ? draft : advance),
      activeSettlementExists: vi.fn().mockResolvedValue(false),
      updateSettlementAdjustment: vi.fn().mockResolvedValue(updated),
      appendAuditLog: vi.fn().mockResolvedValue(undefined)
    } as unknown as ClaimRepository;
    const service = new ClaimService(claims, {} as NotificationService);

    const result = await service.updateSettlementAdjustment(
      draft.claimId,
      { advanceClaimId: advance.claimId, advanceAdjustmentAmount: 2_000 },
      user
    );

    expect(claims.updateSettlementAdjustment).toHaveBeenCalledWith(draft.claimId, advance.claimId, 7_000, 5_000, 2_000);
    expect(result).toMatchObject({
      claimKind: "Reimbursement",
      advanceClaimId: advance.claimId,
      advanceAdjustmentAmount: 2_000,
      finalPayableAmount: 5_000
    });
  });

  it("does not allow a claimant to adjust another employee's advance", async () => {
    const draft = claim({});
    const otherEmployeeAdvance = claim({
      claimId: "00000000-0000-4000-8000-000000000002",
      submitterEmployeeId: "claimant-2",
      claimKind: "Advance",
      status: "PaymentReleased",
      advanceBalance: 5_000
    });
    const claims = {
      getClaimDetail: vi.fn(async (claimId: string) => claimId === draft.claimId ? draft : otherEmployeeAdvance)
    } as unknown as ClaimRepository;
    const service = new ClaimService(claims, {} as NotificationService);

    await expect(
      service.updateSettlementAdjustment(
        draft.claimId,
        { advanceClaimId: otherEmployeeAdvance.claimId, advanceAdjustmentAmount: 2_000 },
        user
      )
    ).rejects.toMatchObject({ message: "Advance adjustments must be linked to a paid advance." });
  });

  it("does not convert a reimbursement draft when no adjustment is applied", async () => {
    const draft = claim({});
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(draft)
    } as unknown as ClaimRepository;
    const service = new ClaimService(claims, {} as NotificationService);

    await expect(
      service.updateSettlementAdjustment(
        draft.claimId,
        { advanceClaimId: "00000000-0000-4000-8000-000000000003", advanceAdjustmentAmount: 0 },
        user
      )
    ).rejects.toMatchObject({ message: "Enter an advance adjustment amount greater than zero." });
  });
});
