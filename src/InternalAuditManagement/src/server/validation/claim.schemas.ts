import { z } from "zod";
import { expenseTags, submissionModes } from "../domain/types";

export const createClaimSchema = z
  .object({
    submissionMode: z.enum(submissionModes),
    siteId: z.string().trim().min(1).nullable().optional(),
    proformaPeriodStart: z.string().date().nullable().optional(),
    proformaPeriodEnd: z.string().date().nullable().optional()
  })
  .superRefine((value, ctx) => {
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
    description: z.string().trim().min(3).max(500),
    amount: z.coerce.number().positive(),
    transactionDate: z.string().date(),
    expenseTag: z.enum(expenseTags),
    clientInvoiceNumber: z.string().trim().min(1).max(100).nullable().optional(),
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
        message: "A valid Client Invoice Number is required for Already Billed items."
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

export type CreateClaimInput = z.infer<typeof createClaimSchema>;
export type CreateLineItemInput = z.infer<typeof createLineItemSchema>;

export const approveClaimSchema = z.object({
  remarks: z.string().trim().max(1000).optional()
});

export const rejectClaimSchema = z.object({
  reason: z.string().trim().min(5).max(1000)
});

export const confirmPhysicalReceiptSchema = z.object({
  physicalReceiptDate: z.string().date(),
  physicalReceiptTime: z.string().regex(/^\d{2}:\d{2}$/),
  receivedByName: z.string().trim().min(2).max(200)
});

export type ApproveClaimInput = z.infer<typeof approveClaimSchema>;
export type RejectClaimInput = z.infer<typeof rejectClaimSchema>;
export type ConfirmPhysicalReceiptInput = z.infer<typeof confirmPhysicalReceiptSchema>;
