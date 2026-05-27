import type {
  ApprovalStep,
  ApprovalQueueItem,
  AuditActionType,
  BillingAlert,
  BillingAlertQueueItem,
  ClaimDetail,
  ClaimStatus,
  ClientContract,
  Employee,
  FinanceQueueItem,
  ExpenseClaim,
  ExpenseAttachment,
  ExpenseLineItem,
  FraudFlag,
  FraudFlagQueueItem,
  FraudFlagStatus,
  FraudRuleName,
  MisDashboardMetrics,
  OverviewMetrics,
  Site,
  SubmissionMode
} from "../domain/types";
import type { CreateClaimInput, CreateLineItemInput } from "../validation/claim.schemas";
import type { CreateContractInput, CreateSiteInput } from "../validation/claim.schemas";

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

export interface ClaimRepository {
  listClaimsForUser(userId: string, role: string): Promise<ExpenseClaim[]>;
  listActiveSites(): Promise<Site[]>;
  listContracts(): Promise<ClientContract[]>;
  createContract(input: CreateContractInput): Promise<ClientContract>;
  createSite(input: CreateSiteInput): Promise<Site>;
  deactivateSite(siteId: string): Promise<Site>;
  getClaimDetail(claimId: string): Promise<ClaimDetail | null>;
  createClaim(input: CreateClaimRecord): Promise<ExpenseClaim>;
  addLineItem(claimId: string, input: CreateLineItemInput): Promise<ExpenseLineItem>;
  updateLineItem(claimId: string, lineItemId: string, input: CreateLineItemInput): Promise<ExpenseLineItem>;
  deleteLineItem(claimId: string, lineItemId: string): Promise<void>;
  submitClaim(claimId: string, nextStatus: ClaimStatus): Promise<ExpenseClaim>;
  updateClaimTotal(claimId: string): Promise<void>;
  createApprovalSteps(steps: Omit<ApprovalStep, "stepId" | "decision" | "decisionAt" | "remarks">[]): Promise<void>;
  appendAuditLog(input: AuditLogInput): Promise<void>;
  getEmployee(employeeId: string): Promise<Employee | null>;
  findManagingDirector(): Promise<Employee | null>;
  listApprovalQueue(userId: string, role: string): Promise<ApprovalQueueItem[]>;
  listFinanceQueue(): Promise<FinanceQueueItem[]>;
  getPendingApprovalStep(claimId: string): Promise<ApprovalStep | null>;
  decideApprovalStep(stepId: string, decision: "Approved" | "Rejected", remarks?: string | null): Promise<void>;
  rejectClaim(claimId: string, reason: string): Promise<ExpenseClaim>;
  reopenRejectedClaim(claimId: string): Promise<ExpenseClaim>;
  confirmPhysicalReceipt(claimId: string, confirmedAt: string, confirmedBy: string): Promise<ExpenseClaim>;
  createFinanceApprovalStep(claimId: string): Promise<void>;
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
}

export type ClaimSummary = Pick<
  ExpenseClaim,
  "claimId" | "submissionMode" | "status" | "totalAmount" | "siteId" | "createdAt" | "updatedAt"
> & {
  statusLabel: string;
  siteName: string | null;
};

export function defaultClaimRecord(
  input: CreateClaimRecord,
  claimId: string,
  now: string
): ExpenseClaim {
  return {
    claimId,
    submitterEmployeeId: input.submitterEmployeeId,
    submissionMode: input.submissionMode as SubmissionMode,
    proformaPeriodStart: input.proformaPeriodStart ?? null,
    proformaPeriodEnd: input.proformaPeriodEnd ?? null,
    status: "Draft",
    totalAmount: 0,
    siteId: input.siteId ?? null,
    rejectionReason: null,
    physicalReceiptConfirmedAt: null,
    physicalReceiptConfirmedBy: null,
    createdAt: now,
    updatedAt: now
  };
}
