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
  const normalizedExpenses = Math.max(0, totalExpenses);
  const normalizedAdvanceBalance = Math.max(0, openAdvanceBalance);

  return {
    advanceAdjusted: Math.min(normalizedExpenses, normalizedAdvanceBalance),
    finalPayable: Math.max(normalizedExpenses - normalizedAdvanceBalance, 0),
    netAdvanceLeft: Math.max(normalizedAdvanceBalance - normalizedExpenses, 0)
  };
}

export function calculateAdvanceLedgerAmounts(
  advanceAmount: number,
  currentSettledAmount: number,
  settlementExpenses: number
): AdvanceLedgerAmounts {
  const normalizedAdvanceAmount = Math.max(0, advanceAmount);
  const normalizedSettledAmount = Math.min(Math.max(0, currentSettledAmount), normalizedAdvanceAmount);
  const openAdvanceBalance = normalizedAdvanceAmount - normalizedSettledAmount;
  const adjustmentAmount = Math.min(Math.max(0, settlementExpenses), openAdvanceBalance);
  const nextSettledAmount = normalizedSettledAmount + adjustmentAmount;

  return {
    adjustmentAmount,
    nextSettledAmount,
    nextAdvanceBalance: normalizedAdvanceAmount - nextSettledAmount
  };
}
