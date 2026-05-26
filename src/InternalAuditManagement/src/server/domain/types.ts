export const submissionModes = ["SingleVoucher", "Proforma"] as const;
export type SubmissionMode = (typeof submissionModes)[number];

export const claimStatuses = [
  "Draft",
  "Submitted",
  "HodApproved",
  "MdApproved",
  "FinanceConfirmed",
  "PaymentReleased",
  "Rejected"
] as const;
export type ClaimStatus = (typeof claimStatuses)[number];

export const expenseTags = [
  "AlreadyBilled",
  "PendingBilling",
  "ContractPartCost",
  "BackendCTC"
] as const;
export type ExpenseTag = (typeof expenseTags)[number];

export const userRoles = [
  "Claimant",
  "HOD",
  "MD",
  "Finance",
  "BillingTeam",
  "FinanceHOD"
] as const;
export type UserRole = (typeof userRoles)[number];

export const auditActionTypes = [
  "DRAFT_SAVED",
  "RECEIPT_UPLOADED",
  "BILLING_ALERT_CREATED",
  "INVOICE_LINKED",
  "SUBMIT",
  "HOD_APPROVE",
  "MD_APPROVE",
  "FINANCE_CONFIRM",
  "PHYSICAL_RECEIPT_CONFIRM",
  "PAYMENT_RELEASE",
  "REJECT",
  "BILLABLE_TAG_CHANGE",
  "FRAUD_FLAG",
  "FRAUD_CLEAR",
  "FRAUD_ESCALATE"
] as const;
export type AuditActionType = (typeof auditActionTypes)[number];

export type UserContext = {
  userId: string;
  role: UserRole;
  email?: string;
  name?: string;
  correlationId: string;
};

export type Employee = {
  employeeId: string;
  fullName: string;
  email: string;
  role: UserRole;
  directManagerId: string | null;
  isHod: boolean;
  approvalThresholdAmount: number;
  isActive: boolean;
};

export type ExpenseClaim = {
  claimId: string;
  submitterEmployeeId: string;
  submissionMode: SubmissionMode;
  proformaPeriodStart: string | null;
  proformaPeriodEnd: string | null;
  status: ClaimStatus;
  totalAmount: number;
  siteId: string | null;
  rejectionReason: string | null;
  physicalReceiptConfirmedAt: string | null;
  physicalReceiptConfirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseLineItem = {
  lineItemId: string;
  claimId: string;
  description: string;
  amount: number;
  transactionDate: string;
  expenseTag: ExpenseTag;
  clientInvoiceNumber: string | null;
  invoiceValidationStatus: "Valid" | "Invalid" | "NotApplicable" | "PendingErpValidation";
  billingAlertCreated: boolean;
  siteId: string | null;
  missingReceiptFlag: boolean;
  sortOrder: number;
};

export type ExpenseAttachment = {
  attachmentId: string;
  lineItemId: string;
  storagePath: string;
  contentHash: string;
  originalFileName: string;
  fileSizeBytes: number;
  contentType: string;
  uploadedAt: string;
  uploadedByUserId: string;
};

export type ApprovalStep = {
  stepId: string;
  claimId: string;
  stepOrder: number;
  requiredApproverRole: "HOD" | "MD" | "Finance";
  assignedApproverId: string | null;
  decision: "Pending" | "Approved" | "Rejected";
  decisionAt: string | null;
  remarks: string | null;
};

export type ClaimDetail = ExpenseClaim & {
  lineItems: Array<ExpenseLineItem & { attachments: ExpenseAttachment[] }>;
  approvalSteps: ApprovalStep[];
};

export type ApprovalQueueItem = {
  claimId: string;
  submittedBy: string;
  submittedByRole: UserRole;
  siteName: string | null;
  totalAmount: number;
  lineItemCount: number;
  missingReceiptCount: number;
  submittedAt: string;
  daysPending: number;
  urgencyLevel: "Normal" | "Attention" | "Overdue";
};

export type FinanceQueueItem = ApprovalQueueItem & {
  physicalReceiptRequired: boolean;
  physicalReceiptConfirmed: boolean;
  hasPendingBillingItems: boolean;
  pendingBillingItemCount: number;
};

export type BillingAlert = {
  alertId: string;
  lineItemId: string;
  claimId: string;
  createdAt: string;
  lastSentAt: string | null;
  nextSendAt: string;
  escalationLevel: 0 | 1;
  alertsSentCount: number;
  isResolved: boolean;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
};

export type BillingAlertQueueItem = BillingAlert & {
  lineItemDescription: string;
  amount: number;
  claimantName: string;
  siteName: string | null;
  daysOpen: number;
  urgencyLabel: string;
};

export function statusLabel(status: ClaimStatus): string {
  const labels: Record<ClaimStatus, string> = {
    Draft: "Draft - not yet submitted",
    Submitted: "Submitted - waiting for your manager",
    HodApproved: "Manager approved - now with Finance",
    MdApproved: "Director approved - now with Finance",
    FinanceConfirmed: "Finance confirmed - payment being processed",
    PaymentReleased: "Paid",
    Rejected: "Returned - see reason below"
  };

  return labels[status];
}
