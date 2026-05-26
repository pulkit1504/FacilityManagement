import type {
  ApprovalStep,
  ApprovalQueueItem,
  AuditActionType,
  ClaimDetail,
  ClaimStatus,
  Employee,
  FinanceQueueItem,
  ExpenseClaim,
  ExpenseAttachment,
  ExpenseLineItem,
  SubmissionMode
} from "../domain/types";
import type { CreateClaimInput, CreateLineItemInput } from "../validation/claim.schemas";

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

export interface ClaimRepository {
  listClaimsForUser(userId: string, role: string): Promise<ExpenseClaim[]>;
  getClaimDetail(claimId: string): Promise<ClaimDetail | null>;
  createClaim(input: CreateClaimRecord): Promise<ExpenseClaim>;
  addLineItem(claimId: string, input: CreateLineItemInput): Promise<ExpenseLineItem>;
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
  confirmPhysicalReceipt(claimId: string, confirmedAt: string, confirmedBy: string): Promise<ExpenseClaim>;
  createFinanceApprovalStep(claimId: string): Promise<void>;
  createAttachment(input: CreateAttachmentRecord): Promise<ExpenseAttachment>;
  getAttachment(attachmentId: string): Promise<ExpenseAttachment | null>;
  clearMissingReceiptFlag(lineItemId: string): Promise<void>;
}

export type ClaimSummary = Pick<
  ExpenseClaim,
  "claimId" | "submissionMode" | "status" | "totalAmount" | "siteId" | "createdAt" | "updatedAt"
> & {
  statusLabel: string;
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
