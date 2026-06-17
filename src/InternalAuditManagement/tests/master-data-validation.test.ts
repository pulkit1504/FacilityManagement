import { describe, expect, it } from "vitest";
import { assignSiteClusterHeadSchema, createClaimSchema, createEmployeeSchema, createExpenseHeadSchema, createSiteSchema, resetEmployeePasswordSchema } from "../src/server/validation/claim.schemas";

describe("GA master-data validation", () => {
  it("only permits Reimbursement through the expense claim intake", () => {
    expect(createClaimSchema.safeParse({ submissionMode: "SingleVoucher", claimKind: "Settlement" }).success).toBe(false);
    expect(createClaimSchema.safeParse({ submissionMode: "SingleVoucher", claimKind: "Reimbursement" }).success).toBe(true);
  });

  it("requires a Cluster Head for new sites", () => {
    const result = createSiteSchema.safeParse({
      siteName: "GA Site",
      serviceType: "Both",
      contractId: "contract-1"
    });

    expect(result.success).toBe(false);
  });

  it("requires a Cluster Head when repairing existing site routing", () => {
    expect(assignSiteClusterHeadSchema.safeParse({ clusterHeadEmployeeId: "" }).success).toBe(false);
  });

  it("validates expense head and password reset admin inputs", () => {
    expect(createExpenseHeadSchema.safeParse({ name: "Repairs", description: null }).success).toBe(true);
    expect(createExpenseHeadSchema.safeParse({ name: "" }).success).toBe(false);
    expect(resetEmployeePasswordSchema.safeParse({ temporaryPassword: "ChangeMe123!", requirePasswordReset: true }).success).toBe(true);
    expect(resetEmployeePasswordSchema.safeParse({ temporaryPassword: "short" }).success).toBe(false);
  });

  it("requires complete beneficiary details for payable employees", () => {
    const result = createEmployeeSchema.safeParse({
      employeeId: "ga-user",
      fullName: "GA User",
      email: "ga@example.com",
      role: "Claimant",
      directManagerId: "emp-hod-001",
      isHod: false,
      approvalThresholdAmount: 0,
      imprestAdvanceLimit: 0
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.error.flatten().fieldErrors)).toEqual(
        expect.arrayContaining(["bankAccountHolderName", "bankAccountNumber", "bankIfsc", "bankName"])
      );
    }
  });
});
