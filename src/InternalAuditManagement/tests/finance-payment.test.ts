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
