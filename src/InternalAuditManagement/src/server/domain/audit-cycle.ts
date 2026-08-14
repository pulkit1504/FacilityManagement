export type AuditCycleEntry = {
  actionType: string;
};

export function currentAuditCycleVoucherReceipt<T extends AuditCycleEntry>(entries: T[]): T | null {
  let receipt: T | null = null;
  for (const entry of entries) {
    if (entry.actionType === "AUDIT_INFO_REQUEST" || entry.actionType === "AUDIT_REJECT") {
      receipt = null;
    } else if (entry.actionType === "AUDITOR_VOUCHERS_RECEIVED") {
      receipt = entry;
    }
  }
  return receipt;
}
