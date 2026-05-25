import type {
  ApprovalStep,
  AuditActionType,
  ClaimDetail,
  ClaimStatus,
  Employee,
  ExpenseClaim,
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
