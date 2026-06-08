import { z } from "zod";
import { expenseTags, paymentModes, submissionModes, userRoles } from "../domain/types";

export const createClaimSchema = z
  .object({
    submissionMode: z.enum(submissionModes),
    claimKind: z.enum(["Reimbursement", "Advance"]).default("Reimbursement"),
    siteId: z.string().trim().min(1).nullable().optional(),
    claimPeriodMonth: z.string().date().nullable().optional(),
    advanceClaimId: z.string().uuid().nullable().optional(),
    proformaPeriodStart: z.string().date().nullable().optional(),
    proformaPeriodEnd: z.string().date().nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.claimKind === "Advance") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["claimKind"],
        message: "Use the imprest advance request form to create advances."
      });
    }

    if (value.submissionMode === "Proforma") {
      if (!value.proformaPeriodStart || !value.proformaPeriodEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Proforma claims require a start and end date."
        });
      }

      if (
        value.proformaPeriodStart &&
        value.proformaPeriodEnd &&
        value.proformaPeriodEnd <= value.proformaPeriodStart
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Proforma end date must be after the start date."
        });
      }
    }
  });

export const createLineItemSchema = z
  .object({
    expenseHead: z.string().trim().min(1).max(120).nullable().optional(),
    description: z.string().trim().min(3).max(500),
    amount: z.coerce.number().positive(),
    transactionDate: z.string().date(),
    paymentMode: z.enum(paymentModes).nullable().optional(),
    expenseTag: z.enum(expenseTags),
    clientInvoiceNumber: z.string().trim().min(1).max(100).nullable().optional(),
    vendorName: z.string().trim().min(1).max(200).nullable().optional(),
    vendorInvoiceNumber: z.string().trim().min(1).max(100).nullable().optional(),
    billableAmount: z.coerce.number().nonnegative().nullable().optional(),
    siteOrDepartment: z.string().trim().min(1).max(200).nullable().optional(),
    lineTicketId: z.string().trim().min(1).max(100).nullable().optional(),
    siteId: z.string().trim().min(1).nullable().optional(),
    sortOrder: z.coerce.number().int().nonnegative().default(0)
  })
  .superRefine((value, ctx) => {
    if (value.transactionDate > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transactionDate"],
        message: "Transaction date cannot be in the future."
      });
    }

    if (value.expenseTag === "AlreadyBilled" && !value.clientInvoiceNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientInvoiceNumber"],
        message: "Client invoice number is required for B2C - Already Billed items."
      });
    }

    if (value.expenseTag === "AlreadyBilled" && !value.vendorInvoiceNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vendorInvoiceNumber"],
        message: "Vendor invoice number is required for B2C - Already Billed items."
      });
    }

    if (value.expenseTag === "PendingBilling" && (value.billableAmount ?? 0) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["billableAmount"],
        message: "B2C - Pending Billing items require the billable amount."
      });
    }

    if (["ContractPartCost", "BackendCTC"].includes(value.expenseTag) && !value.siteOrDepartment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["siteOrDepartment"],
        message: "This expense tag requires a site or department reference."
      });
    }

    if (value.expenseTag === "ContractPartCost" && !value.siteId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["siteId"],
        message: "Contract Part Cost items must be linked to a site."
      });
    }
  });

export const createAdvanceRequestSchema = z.object({
  siteId: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  description: z.string().trim().min(3).max(500),
  claimPeriodMonth: z.string().date().nullable().optional()
});

export const updateSettlementAdjustmentSchema = z.object({
  advanceClaimId: z.string().uuid().optional(),
  advanceAdjustmentAmount: z.coerce.number().nonnegative()
});

export const submitClaimSchema = z.object({
  outstandingAdvancesReviewed: z.boolean().default(false)
});

export type CreateClaimInput = z.infer<typeof createClaimSchema>;
export type CreateLineItemInput = z.infer<typeof createLineItemSchema>;
export type CreateAdvanceRequestInput = z.infer<typeof createAdvanceRequestSchema>;
export type UpdateSettlementAdjustmentInput = z.infer<typeof updateSettlementAdjustmentSchema>;

export const approveClaimSchema = z.object({
  remarks: z.string().trim().max(1000).optional()
});

export const rejectClaimSchema = z.object({
  reason: z.string().trim().min(5).max(1000)
});

export const financeLineReviewSchema = z.object({
  decision: z.enum(["Accepted", "Rejected"]),
  remarks: z.string().trim().max(1000).nullable().optional()
}).superRefine((value, ctx) => {
  if (value.decision === "Rejected" && !value.remarks) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["remarks"],
      message: "Remarks are required when rejecting a line item."
    });
  }
});

export const confirmPhysicalReceiptSchema = z.object({
  physicalReceiptDate: z.string().date(),
  physicalReceiptTime: z.string().regex(/^\d{2}:\d{2}$/),
  receivedByName: z.string().trim().min(2).max(200)
});

export const linkInvoiceSchema = z.object({
  clientInvoiceNumber: z.string().trim().min(3).max(100)
});

export const reviewFraudFlagSchema = z.object({
  decision: z.enum(["Cleared", "Escalated"]),
  remarks: z.string().trim().min(5).max(1000)
});

export const auditClaimDecisionSchema = z.object({
  remarks: z.string().trim().min(5).max(1000)
});

export const createContractSchema = z.object({
  clientName: z.string().trim().min(2).max(200),
  description: z.string().trim().max(500).nullable().optional(),
  startDate: z.string().date(),
  endDate: z.string().date().nullable().optional()
});

export const createSiteSchema = z.object({
  siteName: z.string().trim().min(2).max(200),
  siteAddress: z.string().trim().max(500).nullable().optional(),
  serviceType: z.enum(["Housekeeping", "Security", "Both"]),
  contractId: z.string().trim().min(1),
  clusterHeadEmployeeId: z.string().trim().min(1, "Select a Cluster Head.")
});

export const assignSiteClusterHeadSchema = z.object({
  clusterHeadEmployeeId: z.string().trim().min(1, "Select a Cluster Head.")
});

export const createEmployeeSchema = z.object({
  employeeId: z.string().trim().min(3).max(100),
  fullName: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320),
  role: z.enum(userRoles),
  directManagerId: z.string().trim().min(1).nullable().optional(),
  isHod: z.boolean().default(false),
  approvalThresholdAmount: z.coerce.number().nonnegative().default(0),
  imprestAdvanceLimit: z.coerce.number().nonnegative().default(0),
  bankAccountHolderName: z.string().trim().min(1).max(200).nullable().optional(),
  bankAccountNumber: z.string().trim().min(4).max(40).nullable().optional(),
  bankIfsc: z.string().trim().min(4).max(20).nullable().optional(),
  bankName: z.string().trim().min(2).max(120).nullable().optional(),
  temporaryPassword: z.string().min(8).max(128).nullable().optional()
}).superRefine((value, ctx) => {
  if (!["Claimant", "ClusterHead", "HOD"].includes(value.role)) return;

  const bankFields = [
    ["bankAccountHolderName", value.bankAccountHolderName],
    ["bankAccountNumber", value.bankAccountNumber],
    ["bankIfsc", value.bankIfsc],
    ["bankName", value.bankName]
  ] as const;
  for (const [field, fieldValue] of bankFields) {
    if (!fieldValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: "Required for employees who can submit payable claims."
      });
    }
  }
});

export const createHolidaySchema = z.object({
  holidayDate: z.string().date(),
  holidayName: z.string().trim().min(2).max(200),
  isNational: z.boolean().default(true)
});

export const cleanupStaleRecordsSchema = z.object({
  olderThanDays: z.coerce.number().int().min(30).max(365).default(90)
});

export const updateBankDetailsSchema = z.object({
  bankAccountHolderName: z.string().trim().min(2).max(200),
  bankAccountNumber: z.string().trim().min(4).max(40),
  bankIfsc: z.string().trim().min(4).max(20),
  bankName: z.string().trim().min(2).max(120)
});

export type ApproveClaimInput = z.infer<typeof approveClaimSchema>;
export type RejectClaimInput = z.infer<typeof rejectClaimSchema>;
export type FinanceLineReviewInput = z.infer<typeof financeLineReviewSchema>;
export type ConfirmPhysicalReceiptInput = z.infer<typeof confirmPhysicalReceiptSchema>;
export type LinkInvoiceInput = z.infer<typeof linkInvoiceSchema>;
export type ReviewFraudFlagInput = z.infer<typeof reviewFraudFlagSchema>;
export type AuditClaimDecisionInput = z.infer<typeof auditClaimDecisionSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type AssignSiteClusterHeadInput = z.infer<typeof assignSiteClusterHeadSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type CleanupStaleRecordsInput = z.infer<typeof cleanupStaleRecordsSchema>;
export type UpdateBankDetailsInput = z.infer<typeof updateBankDetailsSchema>;
