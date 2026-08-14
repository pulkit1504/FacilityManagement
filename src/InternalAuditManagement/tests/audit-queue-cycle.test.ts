import { describe, expect, it } from "vitest";
import { currentAuditCycleVoucherReceipt } from "../src/server/domain/audit-cycle";

describe("Audit queue receipt cycle", () => {
  it("does not reuse a voucher receipt from before an Audit information request", () => {
    expect(currentAuditCycleVoucherReceipt([
      { actionType: "AUDITOR_VOUCHERS_RECEIVED", actionTimestamp: "2026-08-01T10:00:00.000Z" },
      { actionType: "AUDIT_INFO_REQUEST", actionTimestamp: "2026-08-02T10:00:00.000Z" }
    ])).toBeNull();
  });

  it("shows the new voucher receipt recorded after the corrected claim returns", () => {
    expect(currentAuditCycleVoucherReceipt([
      { actionType: "AUDITOR_VOUCHERS_RECEIVED", actionTimestamp: "2026-08-01T10:00:00.000Z" },
      { actionType: "AUDIT_INFO_REQUEST", actionTimestamp: "2026-08-02T10:00:00.000Z" },
      { actionType: "AUDITOR_VOUCHERS_RECEIVED", actionTimestamp: "2026-08-05T10:00:00.000Z" }
    ])?.actionTimestamp).toBe("2026-08-05T10:00:00.000Z");
  });
});
