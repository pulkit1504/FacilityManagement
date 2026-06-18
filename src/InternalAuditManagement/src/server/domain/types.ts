export const submissionModes = ["SingleVoucher", "Proforma"] as const;
export type SubmissionMode = (typeof submissionModes)[number];

export const claimKinds = ["Advance", "Reimbursement"] as const;
export type ClaimKind = (typeof claimKinds)[number];

export const paymentModes = ["Cash", "UPI"] as const;
export type PaymentMode = (typeof paymentModes)[number];

export const claimStatuses = [
  "Draft",
  "Submitted",
  "HodApproved",
  "MdApproved",
  "AuditPending",
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
  "ClusterHead",
  "HOD",
  "MD",
  "Finance",
  "BillingTeam",
  "Auditor",
  "Admin"
] as const;
export type UserRole = (typeof userRoles)[number];

export const auditActionTypes = [
  "DRAFT_SAVED",
  "RECEIPT_UPLOADED",
  "BILLING_ALERT_CREATED",
  "INVOICE_LINKED",
  "SUBMIT",
  "CLUSTER_HEAD_APPROVE",
  "HOD_APPROVE",
  "MD_APPROVE",
  "FINANCE_CONFIRM",
  "FINANCE_LINE_ACCEPT",
  "FINANCE_LINE_REJECT",
  "PHYSICAL_RECEIPT_CONFIRM",
  "AUDITOR_VOUCHERS_RECEIVED",
  "AUDIT_APPROVE",
  "AUDIT_REJECT",
  "AUDIT_INFO_REQUEST",
  "PAYMENT_RELEASE",
  "CLAIM_COMMENT",
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
  imprestAdvanceLimit: number;
  bankAccountHolderName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  passwordResetRequired?: boolean;
  passwordUpdatedAt?: string | null;
  isActive: boolean;
};

export type Holiday = {
  holidayDate: string;
  holidayName: string;
  isNational: boolean;
};

export type ExpenseHead = {
  expenseHeadId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Site = {
  siteId: string;
  siteName: string;
  siteAddress: string | null;
  serviceType: "Housekeeping" | "Security" | "Both";
  contractId: string | null;
  clientName: string | null;
  contractDescription: string | null;
  clusterHeadEmployeeId: string | null;
  clusterHeadName: string | null;
  isActive?: boolean;
};

export type ClientContract = {
  contractId: string;
  clientName: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
};

export type ExpenseClaim = {
  claimId: string;
  ticketId: string;
  submitterEmployeeId: string;
  claimKind: ClaimKind;
  submissionMode: SubmissionMode;
  proformaPeriodStart: string | null;
  proformaPeriodEnd: string | null;
  claimPeriodMonth: string | null;
  advanceClaimId: string | null;
  advanceAmount: number;
  settledAmount: number;
  advanceBalance: number;
  status: ClaimStatus;
  totalAmount: number;
  advanceAdjustmentAmount: number;
  finalPayableAmount: number;
  netAdvanceLeftAmount: number;
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
  expenseHead: string | null;
  description: string;
  amount: number;
  transactionDate: string;
  paymentMode: PaymentMode | null;
  expenseTag: ExpenseTag;
  clientInvoiceNumber: string | null;
  vendorName: string | null;
  vendorInvoiceNumber: string | null;
  billableAmount: number | null;
  siteOrDepartment: string | null;
  lineTicketId: string | null;
  invoiceValidationStatus: "Valid" | "Invalid" | "NotApplicable" | "PendingErpValidation";
  financeReviewStatus: "Pending" | "Accepted" | "Rejected";
  financeReviewRemarks: string | null;
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
  lineItemId?: string | null;
  stepOrder: number;
  requiredApproverRole: "ClusterHead" | "HOD" | "MD" | "Finance" | "Auditor";
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
  ticketId: string;
  submittedBy: string;
  submittedByRole: UserRole;
  siteName: string | null;
  totalAmount: number;
  advanceAdjustmentAmount: number;
  finalPayableAmount: number;
  netAdvanceLeftAmount: number;
  lineItemCount: number;
  missingReceiptCount: number;
  submittedAt: string;
  daysPending: number;
  urgencyLevel: "Normal" | "Attention" | "Overdue";
};

export type FinanceQueueItem = ApprovalQueueItem & {
  ticketId: string;
  claimKind: ClaimKind;
  status: ClaimStatus;
  physicalReceiptRequired: boolean;
  physicalReceiptConfirmed: boolean;
  hasPendingBillingItems: boolean;
  pendingBillingItemCount: number;
  bankAccountHolderName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
};

export type PendingAdvanceItem = {
  claimId: string;
  ticketId: string;
  submittedBy: string;
  siteId: string | null;
  siteName: string | null;
  advanceAmount: number;
  settledAmount: number;
  advanceBalance: number;
  paidAt: string;
  ageDays: number;
  settlementStatus: "Open" | "Aging" | "Overdue";
  settlementStatusLabel: string;
};

export type AuditLogEntry = {
  auditId: string;
  claimId: string;
  actorUserId: string;
  actorName: string | null;
  actionType: AuditActionType;
  preActionStatus: string | null;
  postActionStatus: string;
  auditRemarks: string | null;
  correlationId: string;
  actionTimestamp: string;
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
  billableAmount: number;
  claimantName: string;
  siteName: string | null;
  daysOpen: number;
  urgencyLabel: string;
};

export type FraudRuleName = "DuplicateVoucher" | "ThresholdSplit" | "WeekendOutlier";
export type FraudFlagStatus = "Open" | "Cleared" | "Escalated";

export type FraudFlag = {
  flagId: string;
  primaryClaimId: string;
  relatedClaimIds: string[];
  ruleName: FraudRuleName;
  flaggedAt: string;
  sweepDate: string;
  status: FraudFlagStatus;
  reviewedByUserId: string | null;
  reviewRemarks: string | null;
  reviewedAt: string | null;
};

export type FraudFlagQueueItem = FraudFlag & {
  ruleLabel: string;
  ruleDescription: string;
  relatedClaimCount: number;
  daysOpen: number;
  ticketId: string;
  employeeName: string;
  claimKind: ClaimKind | "Unknown";
  submissionMode: SubmissionMode | "Unknown";
  claimStatus: ClaimStatus | "Unknown";
  statusLabel: string;
  pendingLocation: string;
  siteName: string | null;
  totalAmount: number;
  flaggedLineItems: Array<{
    claimId: string;
    lineItemId: string;
    description: string;
    amount: number;
    transactionDate: string;
    expenseTag: ExpenseTag;
    clientInvoiceNumber: string | null;
    vendorName: string | null;
    vendorInvoiceNumber: string | null;
    missingReceiptFlag: boolean;
    receiptAttachmentCount: number;
  }>;
  approvalTrail: Array<{
    role: string;
    decision: string;
    decidedAt: string | null;
    remarks: string | null;
  }>;
};

export type AuditQueueItem = FinanceQueueItem & {
  receiptConfirmedAt: string | null;
  auditorVoucherReceivedAt: string | null;
  auditDecisionRequired: boolean;
};

export type OverviewMetrics = {
  pendingApprovals: number;
  financeQueueCount: number;
  activeBillingAlerts: number;
  openFraudFlags: number;
  billingRecoveryPct: number | null;
  canViewBillingMetrics: boolean;
  canViewFraudFlags: boolean;
};

export type MisRecoveryMatrixRow = {
  siteName: string;
  totalBillable: number;
  totalBilled: number;
  recoveryPct: number | null;
};

export type MisDashboardMetrics = {
  totalBillableApproved: number;
  totalBilled: number;
  unbilledLeakage: number;
  billingRecoveryPct: number | null;
  oldestBillingAlertDays: number | null;
  recoveryMatrix: MisRecoveryMatrixRow[];
};

export type ImprestLedgerReportRow = {
  ticketId: string;
  claimantName: string;
  siteName: string | null;
  advanceAmount: number;
  settledAmount: number;
  advanceBalance: number;
  status: ClaimStatus;
  paidAt: string | null;
};

export type BillableClaimReportRow = {
  ticketId: string;
  claimantName: string;
  siteName: string | null;
  expenseHead: string | null;
  description: string;
  amount: number;
  billableAmount: number;
  expenseTag: ExpenseTag;
  invoiceNumber: string | null;
  recoveryStatus: "Billed" | "B2C - Pending Billing" | "Non Billable";
  transactionDate: string;
};

export type NotificationOutboxInput = {
  recipientEmployeeId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  relatedClaimId: string | null;
};

export type NotificationOutboxItem = {
  notificationId: string;
  recipientEmployeeId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  relatedClaimId: string | null;
  status: "Queued" | "Sent" | "Failed";
  deliveryAttempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
};

export function statusLabel(status: ClaimStatus): string {
  const labels: Record<ClaimStatus, string> = {
    Draft: "Draft - not yet submitted",
    Submitted: "Submitted - waiting for your manager",
    HodApproved: "Manager approved - now with Finance",
    MdApproved: "Director approved - now with Finance",
    AuditPending: "Receipt confirmed - waiting for Auditor",
    FinanceConfirmed: "Finance confirmed - payment being processed",
    PaymentReleased: "Paid",
    Rejected: "Returned - see reason below"
  };

  return labels[status];
}
