export type SettlementAmounts = {
  advanceAdjusted: number;
  finalPayable: number;
  netAdvanceLeft: number;
};

export type AdvanceLedgerAmounts = {
  adjustmentAmount: number;
  nextSettledAmount: number;
  nextAdvanceBalance: number;
};

export function calculateSettlementAmounts(totalExpenses: number, openAdvanceBalance: number): SettlementAmounts {
  return calculateSelectedSettlementAmounts(totalExpenses, openAdvanceBalance, openAdvanceBalance);
}

export function calculateSelectedSettlementAmounts(
  totalExpenses: number,
  openAdvanceBalance: number,
  requestedAdjustment: number
): SettlementAmounts {
  const normalizedExpenses = Math.max(0, totalExpenses);
  const normalizedAdvanceBalance = Math.max(0, openAdvanceBalance);
  const advanceAdjusted = Math.min(
    Math.max(0, requestedAdjustment),
    normalizedExpenses,
    normalizedAdvanceBalance
  );

  return {
    advanceAdjusted,
    finalPayable: normalizedExpenses - advanceAdjusted,
    netAdvanceLeft: normalizedAdvanceBalance - advanceAdjusted
  };
}

export function calculateAdvanceLedgerAmounts(
  advanceAmount: number,
  currentSettledAmount: number,
  settlementAdjustment: number
): AdvanceLedgerAmounts {
  const normalizedAdvanceAmount = Math.max(0, advanceAmount);
  const normalizedSettledAmount = Math.min(Math.max(0, currentSettledAmount), normalizedAdvanceAmount);
  const openAdvanceBalance = normalizedAdvanceAmount - normalizedSettledAmount;
  const adjustmentAmount = Math.min(Math.max(0, settlementAdjustment), openAdvanceBalance);
  const nextSettledAmount = normalizedSettledAmount + adjustmentAmount;

  return {
    adjustmentAmount,
    nextSettledAmount,
    nextAdvanceBalance: normalizedAdvanceAmount - nextSettledAmount
  };
}
