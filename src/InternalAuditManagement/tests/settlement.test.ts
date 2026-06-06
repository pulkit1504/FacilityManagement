import { describe, expect, it } from "vitest";
import {
  calculateAdvanceLedgerAmounts,
  calculateSelectedSettlementAmounts,
  calculateSettlementAmounts
} from "../src/shared/settlement";

describe("claimant-selected advance settlement", () => {
  it("allows a claimant to adjust less than the maximum available advance", () => {
    expect(calculateSelectedSettlementAmounts(7_000, 5_000, 2_000)).toEqual({
      advanceAdjusted: 2_000,
      finalPayable: 5_000,
      netAdvanceLeft: 3_000
    });
  });

  it("clamps invalid adjustment amounts to expenses and open balance", () => {
    expect(calculateSelectedSettlementAmounts(4_000, 5_000, 9_000)).toEqual({
      advanceAdjusted: 4_000,
      finalPayable: 0,
      netAdvanceLeft: 1_000
    });
  });

  it("retains the maximum-adjustment helper for legacy calculations", () => {
    expect(calculateSettlementAmounts(7_000, 5_000)).toEqual({
      advanceAdjusted: 5_000,
      finalPayable: 2_000,
      netAdvanceLeft: 0
    });
  });

  it("applies only the selected adjustment to the advance ledger", () => {
    expect(calculateAdvanceLedgerAmounts(10_000, 5_000, 2_000)).toEqual({
      adjustmentAmount: 2_000,
      nextSettledAmount: 7_000,
      nextAdvanceBalance: 3_000
    });
  });
});
