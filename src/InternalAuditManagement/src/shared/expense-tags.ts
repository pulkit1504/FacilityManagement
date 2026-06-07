export function expenseTagLabel(expenseTag: string) {
  const labels: Record<string, string> = {
    AlreadyBilled: "B2C - Already Billed",
    PendingBilling: "B2C - Pending Billing",
    ContractPartCost: "Contract Part Cost",
    BackendCTC: "Backend CTC"
  };

  return labels[expenseTag] ?? expenseTag;
}
