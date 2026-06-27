import type {
  ApprovalStep,
  ApprovalQueueItem,
  AuditActionType,
  AuditImprestRegisterItem,
  AuditLogEntry,
  AuditQueueItem,
  BillingAlert,
  BillingAlertQueueItem,
  BillableClaimReportRow,
  ClaimDetail,
  ClaimStatus,
  ClientContract,
  Employee,
  FinanceQueueItem,
  ExpenseClaim,
  ExpenseAttachment,
  ExpenseHead,
  ExpenseLineItem,
  FraudFlag,
  FraudFlagQueueItem,
  FraudFlagStatus,
  Holiday,
  FraudRuleName,
  ImprestLedgerReportRow,
  MisDashboardMetrics,
  NotificationOutboxInput,
  NotificationOutboxItem,
  OverviewMetrics,
  PendingAdvanceItem,
  Site,
  SubmissionMode
} from "../domain/types";
import type { CreateClaimInput, CreateLineItemInput } from "../validation/claim.schemas";
import type { ChangePasswordInput, CreateContractInput, CreateEmployeeInput, CreateExpenseHeadInput, CreateHolidayInput, CreateSiteInput, ResetEmployeePasswordInput, UpdateBankDetailsInput, UpdateExpenseHeadInput, UpdateSiteInput } from "../validation/claim.schemas";

export type CreateClaimRecord = CreateClaimInput & {
  submitterEmployeeId: string;
};

export type AuditLogInput = {
  claimId: string;
  actorUserId: string;
  actionType: AuditActionType;
  preActionStatus: string | null;
  postActionStatus: string;
  auditRemarks?: string | null;
  correlationId: string;
};

export type CreateAttachmentRecord = {
  lineItemId: string;
  storagePath: string;
  contentHash: string;
  originalFileName: string;
  fileSizeBytes: number;
  contentType: string;
  uploadedByUserId: string;
};

export type CreateBillingAlertRecord = {
  claimId: string;
  lineItemId: string;
  nextSendAt: string;
};

export type CreateFraudFlagRecord = {
  primaryClaimId: string;
  relatedClaimIds: string[];
  ruleName: FraudRuleName;
  sweepDate: string;
};

export type CleanupResult = {
  staleDraftsRemoved: number;
  exhaustedNotificationsRemoved: number;
};

export interface ClaimRepository {
  listClaimsForUser(userId: string, role: string): Promise<ExpenseClaim[]>;
  listActiveSites(): Promise<Site[]>;
  listSites(includeInactive?: boolean): Promise<Site[]>;
  listContracts(): Promise<ClientContract[]>;
  createContract(input: CreateContractInput): Promise<ClientContract>;
  createSite(input: CreateSiteInput): Promise<Site>;
  updateSite(siteId: string, input: UpdateSiteInput): Promise<Site>;
  assignSiteClusterHead(siteId: string, clusterHeadEmployeeId: string): Promise<Site>;
  deactivateSite(siteId: string): Promise<Site>;
  listEmployees(): Promise<Employee[]>;
  createEmployee(input: CreateEmployeeInput): Promise<Employee>;
  deactivateEmployee(employeeId: string): Promise<Employee>;
  listHolidays(): Promise<Holiday[]>;
  createHoliday(input: CreateHolidayInput): Promise<Holiday>;
  deleteHoliday(holidayDate: string): Promise<void>;
  listExpenseHeads(includeInactive?: boolean): Promise<ExpenseHead[]>;
  createExpenseHead(input: CreateExpenseHeadInput): Promise<ExpenseHead>;
  updateExpenseHead(expenseHeadId: string, input: UpdateExpenseHeadInput): Promise<ExpenseHead>;
  deactivateExpenseHead(expenseHeadId: string): Promise<ExpenseHead>;
  resetEmployeePassword(employeeId: string, input: ResetEmployeePasswordInput): Promise<Employee>;
  changeEmployeePassword(employeeId: string, input: ChangePasswordInput): Promise<Employee | null>;
  getClaimDetail(claimId: string): Promise<ClaimDetail | null>;
  createClaim(input: CreateClaimRecord): Promise<ExpenseClaim>;
  addLineItem(claimId: string, input: CreateLineItemInput): Promise<ExpenseLineItem>;
  updateLineItem(claimId: string, lineItemId: string, input: CreateLineItemInput): Promise<ExpenseLineItem>;
  reviewLineItem(claimId: string, lineItemId: string, decision: "Accepted" | "Rejected", remarks?: string | null): Promise<ExpenseLineItem>;
  reviewAuditLineItem(claimId: string, lineItemId: string, input: {
    decision: "Approved" | "Rejected";
    approvedAmount: number | null;
    remarks?: string | null;
    reviewedByUserId: string;
  }): Promise<ExpenseLineItem>;
  deleteLineItem(claimId: string, lineItemId: string): Promise<void>;
  invoiceReferenceExists(
    invoiceNumber: string,
    options?: {
      referenceType?: "Client" | "Vendor";
      vendorName?: string | null;
      excludingLineItemId?: string;
    }
  ): Promise<boolean>;
  submitClaim(claimId: string, nextStatus: ClaimStatus): Promise<ExpenseClaim>;
  updateClaimTotal(claimId: string): Promise<void>;
  updateSettlementAdjustment(claimId: string, advanceClaimId: string, totalAmount: number, openAdvanceBalance: number, adjustmentAmount: number): Promise<ExpenseClaim>;
  createApprovalSteps(steps: Omit<ApprovalStep, "stepId" | "decision" | "decisionAt" | "remarks">[]): Promise<void>;
  appendAuditLog(input: AuditLogInput): Promise<void>;
  listAuditLogForClaim(claimId: string): Promise<AuditLogEntry[]>;
  getEmployee(employeeId: string): Promise<Employee | null>;
  updateEmployeeBankDetails(employeeId: string, input: UpdateBankDetailsInput): Promise<Employee>;
  getEmployeeByEmail(email: string): Promise<Employee | null>;
  authenticateEmployee(email: string, password: string): Promise<Employee | null>;
  findManagingDirector(): Promise<Employee | null>;
  enqueueNotification(input: NotificationOutboxInput): Promise<NotificationOutboxItem>;
  listNotifications(status?: "Queued" | "Sent" | "Failed" | "All"): Promise<NotificationOutboxItem[]>;
  markNotificationSent(notificationId: string, providerMessageId: string | null): Promise<void>;
  markNotificationFailed(notificationId: string, errorMessage: string): Promise<void>;
  cleanupStaleRecords(cutoffIso: string): Promise<CleanupResult>;
  listApprovalQueue(userId: string, role: string): Promise<ApprovalQueueItem[]>;
  listFinanceQueue(): Promise<FinanceQueueItem[]>;
  listAuditQueue(): Promise<AuditQueueItem[]>;
  listAuditImprestRegister(): Promise<AuditImprestRegisterItem[]>;
  listPendingAdvances(userId: string, role: string): Promise<PendingAdvanceItem[]>;
  activeSettlementExists(advanceClaimId: string, excludingClaimId: string): Promise<boolean>;
  findActiveAdvanceAdjustment(advanceClaimId: string, excludingClaimId: string): Promise<ExpenseClaim | null>;
  releasePaymentAtomically(claimId: string, actorUserId: string, correlationId: string): Promise<ExpenseClaim>;
  getPendingApprovalStep(claimId: string): Promise<ApprovalStep | null>;
  decideApprovalStep(stepId: string, decision: "Approved" | "Rejected", remarks?: string | null): Promise<void>;
  rejectClaim(claimId: string, reason: string): Promise<ExpenseClaim>;
  reopenRejectedClaim(claimId: string): Promise<ExpenseClaim>;
  confirmPhysicalReceipt(claimId: string, confirmedAt: string, confirmedBy: string): Promise<ExpenseClaim>;
  createFinanceApprovalStep(claimId: string): Promise<void>;
  createAuditorApprovalStep(claimId: string): Promise<void>;
  createAttachment(input: CreateAttachmentRecord): Promise<ExpenseAttachment>;
  getAttachment(attachmentId: string): Promise<ExpenseAttachment | null>;
  clearMissingReceiptFlag(lineItemId: string): Promise<void>;
  createBillingAlert(input: CreateBillingAlertRecord): Promise<BillingAlert | null>;
  listBillingAlerts(isResolved?: boolean): Promise<BillingAlertQueueItem[]>;
  getBillingAlert(alertId: string): Promise<BillingAlert | null>;
  linkInvoiceToBillingAlert(alertId: string, invoiceNumber: string, resolvedByUserId: string): Promise<BillingAlert>;
  listClaimsForFraudSweep(): Promise<ClaimDetail[]>;
  createFraudFlag(input: CreateFraudFlagRecord): Promise<FraudFlag | null>;
  listFraudFlags(status?: FraudFlagStatus): Promise<FraudFlagQueueItem[]>;
  reviewFraudFlag(flagId: string, status: Exclude<FraudFlagStatus, "Open">, remarks: string, reviewedByUserId: string): Promise<FraudFlag>;
  listHolidayDates(): Promise<string[]>;
  getOverviewMetrics(userId: string, role: string): Promise<OverviewMetrics>;
  getMisDashboardMetrics(): Promise<MisDashboardMetrics>;
  listImprestLedgerReport(): Promise<ImprestLedgerReportRow[]>;
  listBillableClaimReport(): Promise<BillableClaimReportRow[]>;
}

export type ClaimSummary = Pick<
  ExpenseClaim,
  "claimId" | "submissionMode" | "status" | "totalAmount" | "siteId" | "createdAt" | "updatedAt"
> & {
  ticketId: string;
  claimKind: ExpenseClaim["claimKind"];
  statusLabel: string;
  siteName: string | null;
};

export function defaultClaimRecord(
  input: CreateClaimRecord,
  claimId: string,
  now: string
): ExpenseClaim {
  const ticketDate = new Date(now)
    .toISOString()
    .slice(2, 10)
    .replaceAll("-", "");
  const ticketSuffix = claimId.slice(0, 4).toUpperCase();
  const ticketPrefix = input.claimKind === "Advance" ? "ADV" : "EXP";

  return {
    claimId,
    ticketId: `${ticketPrefix}-${ticketDate}-${ticketSuffix}`,
    submitterEmployeeId: input.submitterEmployeeId,
    claimKind: input.claimKind ?? "Reimbursement",
    submissionMode: input.submissionMode as SubmissionMode,
    proformaPeriodStart: input.proformaPeriodStart ?? null,
    proformaPeriodEnd: input.proformaPeriodEnd ?? null,
    claimPeriodMonth: input.claimPeriodMonth ?? null,
    advanceClaimId: input.advanceClaimId ?? null,
    advanceAmount: 0,
    settledAmount: 0,
    advanceBalance: 0,
    status: "Draft",
    totalAmount: 0,
    advanceAdjustmentAmount: 0,
    finalPayableAmount: 0,
    netAdvanceLeftAmount: 0,
    siteId: input.siteId ?? null,
    rejectionReason: null,
    physicalReceiptConfirmedAt: null,
    physicalReceiptConfirmedBy: null,
    createdAt: now,
    updatedAt: now
  };
}
