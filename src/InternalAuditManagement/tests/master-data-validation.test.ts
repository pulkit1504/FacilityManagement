import { describe, expect, it } from "vitest";
import { assignSiteClusterHeadSchema, createEmployeeSchema, createSiteSchema } from "../src/server/validation/claim.schemas";

describe("GA master-data validation", () => {
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
