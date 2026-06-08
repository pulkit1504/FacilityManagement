import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaimDetail, Employee, ExpenseLineItem, UserContext } from "../src/server/domain/types";
import type { ClaimRepository } from "../src/server/repositories/claim-repository";
import { ClaimService } from "../src/server/services/claim-service";
import type { NotificationService } from "../src/server/services/notification-service";
import { createLineItemSchema } from "../src/server/validation/claim.schemas";

const user: UserContext = {
  userId: "claimant-1",
  role: "Claimant",
  correlationId: "business-rules-test"
};

const notifications = {} as NotificationService;

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    employeeId: user.userId,
    fullName: "Claimant One",
    email: "claimant@example.com",
    role: "Claimant",
    directManagerId: "hod-1",
    isHod: false,
    approvalThresholdAmount: 0,
    imprestAdvanceLimit: 5_000,
    bankAccountHolderName: "Claimant One",
    bankAccountNumber: "1234567890",
    bankIfsc: "HDFC0001234",
    bankName: "HDFC",
    isActive: true,
    ...overrides
  };
}

function claim(overrides: Partial<ClaimDetail> = {}): ClaimDetail {
  return {
    claimId: "claim-1",
    ticketId: "EXP-001",
    submitterEmployeeId: user.userId,
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
    totalAmount: 0,
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

function line(overrides: Partial<ExpenseLineItem> = {}) {
  return {
    expenseHead: "Travel",
    description: "Travel expense",
    amount: 100,
    transactionDate: "2026-06-01",
    paymentMode: "UPI",
    expenseTag: "BackendCTC",
    clientInvoiceNumber: null,
    vendorName: null,
    vendorInvoiceNumber: null,
    billableAmount: null,
    siteOrDepartment: "Operations",
    lineTicketId: null,
    siteId: null,
    sortOrder: 0,
    ...overrides
  } as const;
}

describe("claim business rules", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T08:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires client and vendor invoice numbers for B2C - Already Billed line items", () => {
    expect(() =>
      createLineItemSchema.parse(line({ expenseTag: "AlreadyBilled", transactionDate: "2026-06-03" }))
    ).toThrow("Client invoice number is required for B2C - Already Billed items.");

    expect(() =>
      createLineItemSchema.parse(line({
        expenseTag: "AlreadyBilled",
        transactionDate: "2026-06-03",
        clientInvoiceNumber: "CLIENT-INV-1"
      }))
    ).toThrow("Vendor invoice number is required for B2C - Already Billed items.");
  });

  it("allows B2C - Already Billed line items when client and vendor invoice numbers are supplied", async () => {
    const draft = claim();
    const savedLine = {
      ...line({ expenseTag: "AlreadyBilled", transactionDate: "2026-06-03" }),
      lineItemId: "line-1",
      claimId: draft.claimId,
      invoiceValidationStatus: "NotApplicable",
      financeReviewStatus: "Pending",
      financeReviewRemarks: null,
      billingAlertCreated: false,
      missingReceiptFlag: true
    } as ExpenseLineItem;
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(draft),
      invoiceReferenceExists: vi.fn().mockResolvedValue(false),
      addLineItem: vi.fn().mockResolvedValue(savedLine)
    } as unknown as ClaimRepository;

    const parsed = createLineItemSchema.parse(line({
      expenseTag: "AlreadyBilled",
      transactionDate: "2026-06-03",
      clientInvoiceNumber: "CLIENT-INV-2026-0001",
      vendorInvoiceNumber: "VENDOR-INV-2026-0001"
    }));
    const result = await new ClaimService(claims, notifications).addLineItem(draft.claimId, parsed, user);

    expect(claims.addLineItem).toHaveBeenCalledWith(draft.claimId, expect.objectContaining({
      expenseTag: "AlreadyBilled",
      clientInvoiceNumber: "CLIENT-INV-2026-0001",
      vendorInvoiceNumber: "VENDOR-INV-2026-0001"
    }));
    expect(result.lineItemId).toBe("line-1");
  });

  it("checks both client and vendor invoice numbers for duplicates", async () => {
    const draft = claim();
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(draft),
      invoiceReferenceExists: vi.fn(async (invoiceNumber: string) => invoiceNumber === "VENDOR-DUPLICATE")
    } as unknown as ClaimRepository;

    await expect(
      new ClaimService(claims, notifications).addLineItem(
        draft.claimId,
        createLineItemSchema.parse(line({
          expenseTag: "AlreadyBilled",
          transactionDate: "2026-06-03",
          clientInvoiceNumber: "CLIENT-UNIQUE",
          vendorInvoiceNumber: "VENDOR-DUPLICATE"
        })),
        user
      )
    ).rejects.toMatchObject({ message: "Duplicate invoice number detected." });
    expect(claims.invoiceReferenceExists).toHaveBeenCalledWith("CLIENT-UNIQUE", undefined);
    expect(claims.invoiceReferenceExists).toHaveBeenCalledWith("VENDOR-DUPLICATE", undefined);
  });

  it("blocks single voucher dates more than 20 days old", async () => {
    const draft = claim({ claimPeriodMonth: "2026-05-01" });
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(draft)
    } as unknown as ClaimRepository;

    await expect(
      new ClaimService(claims, notifications).addLineItem(
        draft.claimId,
        createLineItemSchema.parse(line({ transactionDate: "2026-05-17" })),
        user
      )
    ).rejects.toMatchObject({ message: "Single voucher expense date cannot be more than 20 days older than today." });
  });

  it("blocks dates outside the selected expense month", async () => {
    const draft = claim({ claimPeriodMonth: "2026-06-01" });
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(draft)
    } as unknown as ClaimRepository;

    await expect(
      new ClaimService(claims, notifications).addLineItem(
        draft.claimId,
        createLineItemSchema.parse(line({ transactionDate: "2026-05-31" })),
        user
      )
    ).rejects.toMatchObject({ message: "Line item date must fall within the expense month selected for the claim." });
  });

  it("allows periodic claim dates up to 50 days old inside the selected month and proforma period", async () => {
    const draft = claim({
      submissionMode: "Proforma",
      claimPeriodMonth: "2026-04-01",
      proformaPeriodStart: "2026-04-01",
      proformaPeriodEnd: "2026-04-30"
    });
    const savedLine = {
      ...line({ transactionDate: "2026-04-18" }),
      lineItemId: "line-1",
      claimId: draft.claimId,
      invoiceValidationStatus: "NotApplicable",
      financeReviewStatus: "Pending",
      financeReviewRemarks: null,
      billingAlertCreated: false,
      missingReceiptFlag: true
    } as ExpenseLineItem;
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(draft),
      addLineItem: vi.fn().mockResolvedValue(savedLine)
    } as unknown as ClaimRepository;

    await expect(
      new ClaimService(claims, notifications).addLineItem(
        draft.claimId,
        createLineItemSchema.parse(line({ transactionDate: "2026-04-18" })),
        user
      )
    ).resolves.toMatchObject({ lineItemId: "line-1" });
  });

  it("blocks new advances when open balance plus request exceeds the imprest limit", async () => {
    const claims = {
      getEmployee: vi.fn().mockResolvedValue(employee({ imprestAdvanceLimit: 5_000 })),
      listPendingAdvances: vi.fn().mockResolvedValue([{ advanceBalance: 4_500 }])
    } as unknown as ClaimRepository;

    await expect(
      new ClaimService(claims, notifications).createAdvanceRequest(
        { siteId: "site-1", amount: 1_000, description: "Petty cash", claimPeriodMonth: "2026-06-01" },
        user
      )
    ).rejects.toMatchObject({ message: "Advance request exceeds the configured employee limit." });
  });

  it("lets the original claimant reopen a returned claim for correction", async () => {
    const returned = claim({
      status: "Rejected",
      rejectionReason: "Correct the invoice date."
    });
    const reopened = claim({
      status: "Draft",
      rejectionReason: null
    });
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(returned),
      reopenRejectedClaim: vi.fn().mockResolvedValue(reopened),
      appendAuditLog: vi.fn().mockResolvedValue(undefined)
    } as unknown as ClaimRepository;

    const result = await new ClaimService(claims, notifications).reopenReturnedClaim(returned.claimId, user);

    expect(claims.reopenRejectedClaim).toHaveBeenCalledWith(returned.claimId);
    expect(result).toMatchObject({
      claimId: returned.claimId,
      status: "Draft",
      message: "Claim reopened. Apply corrections and submit again."
    });
  });

  it("explains when a returned advance adjustment cannot be reopened because another active claim exists", async () => {
    const returned = claim({
      status: "Rejected",
      advanceClaimId: "advance-1",
      rejectionReason: "Correct the invoice date."
    });
    const active = claim({
      claimId: "active-claim-1",
      ticketId: "EXP-ACTIVE-1",
      advanceClaimId: "advance-1",
      status: "Draft"
    });
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(returned),
      reopenRejectedClaim: vi.fn().mockRejectedValue({ code: "23505", message: "duplicate key value violates unique constraint" }),
      findActiveAdvanceAdjustment: vi.fn().mockResolvedValue(active),
      appendAuditLog: vi.fn()
    } as unknown as ClaimRepository;

    await expect(new ClaimService(claims, notifications).reopenReturnedClaim(returned.claimId, user)).rejects.toMatchObject({
      status: 409,
      message: "This returned claim cannot be prepared for correction because EXP-ACTIVE-1 is already active for the same advance. Continue with that claim or ask Finance to close it before correcting this one.",
      details: {
        activeClaimId: "active-claim-1",
        activeTicketId: "EXP-ACTIVE-1"
      }
    });
    expect(claims.findActiveAdvanceAdjustment).toHaveBeenCalledWith("advance-1", returned.claimId);
    expect(claims.appendAuditLog).not.toHaveBeenCalled();
  });

  it("blocks non-claimants from reopening someone else's returned claim", async () => {
    const returned = claim({
      status: "Rejected",
      rejectionReason: "Correct the invoice date."
    });
    const claims = {
      getClaimDetail: vi.fn().mockResolvedValue(returned),
      reopenRejectedClaim: vi.fn()
    } as unknown as ClaimRepository;

    await expect(
      new ClaimService(claims, notifications).reopenReturnedClaim(returned.claimId, {
        ...user,
        userId: "other-user"
      })
    ).rejects.toMatchObject({ message: "Only the original claimant can reopen this claim." });
    expect(claims.reopenRejectedClaim).not.toHaveBeenCalled();
  });
});
