import { randomUUID } from "node:crypto";
import { notFound } from "../errors/application-error";
import type {
  ApprovalStep,
  ClaimDetail,
  ClaimStatus,
  Employee,
  ExpenseAttachment,
  ExpenseClaim,
  ExpenseLineItem
} from "../domain/types";
import type {
  AuditLogInput,
  ClaimRepository,
  CreateClaimRecord
} from "./claim-repository";
import { defaultClaimRecord } from "./claim-repository";
import type { CreateLineItemInput } from "../validation/claim.schemas";
import { getSupabaseAdminClient } from "./supabase-client";

type ClaimRow = {
  claim_id: string;
  submitter_employee_id: string;
  submission_mode: string;
  proforma_period_start: string | null;
  proforma_period_end: string | null;
  status: string;
  total_amount: number;
  site_id: string | null;
  rejection_reason: string | null;
  physical_receipt_confirmed_at: string | null;
  physical_receipt_confirmed_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapClaim(row: ClaimRow): ExpenseClaim {
  return {
    claimId: row.claim_id,
    submitterEmployeeId: row.submitter_employee_id,
    submissionMode: row.submission_mode as ExpenseClaim["submissionMode"],
    proformaPeriodStart: row.proforma_period_start,
    proformaPeriodEnd: row.proforma_period_end,
    status: row.status as ClaimStatus,
    totalAmount: Number(row.total_amount),
    siteId: row.site_id,
    rejectionReason: row.rejection_reason,
    physicalReceiptConfirmedAt: row.physical_receipt_confirmed_at,
    physicalReceiptConfirmedBy: row.physical_receipt_confirmed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapLineItem(row: Record<string, unknown>): ExpenseLineItem {
  return {
    lineItemId: String(row.line_item_id),
    claimId: String(row.claim_id),
    description: String(row.description),
    amount: Number(row.amount),
    transactionDate: String(row.transaction_date),
    expenseTag: row.expense_tag as ExpenseLineItem["expenseTag"],
    clientInvoiceNumber: row.client_invoice_number ? String(row.client_invoice_number) : null,
    invoiceValidationStatus: row.invoice_validation_status as ExpenseLineItem["invoiceValidationStatus"],
    billingAlertCreated: Boolean(row.billing_alert_created),
    siteId: row.site_id ? String(row.site_id) : null,
    missingReceiptFlag: Boolean(row.missing_receipt_flag),
    sortOrder: Number(row.sort_order)
  };
}

export class SupabaseClaimRepository implements ClaimRepository {
  async listClaimsForUser(userId: string, role: string): Promise<ExpenseClaim[]> {
    const db = await getSupabaseAdminClient();
    let query = db.from("expense_claims").select("*").eq("is_deleted", false).order("created_at", {
      ascending: false
    });

    if (role === "Claimant") {
      query = query.eq("submitter_employee_id", userId);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      throw error;
    }

    return (data as ClaimRow[]).map(mapClaim);
  }

  async getClaimDetail(claimId: string): Promise<ClaimDetail | null> {
    const db = await getSupabaseAdminClient();
    const { data: claim, error } = await db
      .from("expense_claims")
      .select("*")
      .eq("claim_id", claimId)
      .eq("is_deleted", false)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    if (!claim) {
      return null;
    }

    const [{ data: lines, error: linesError }, { data: approvals, error: approvalsError }] =
      await Promise.all([
        db.from("expense_line_items").select("*").eq("claim_id", claimId).eq("is_deleted", false),
        db.from("approval_steps").select("*").eq("claim_id", claimId).order("step_order")
      ]);

    if (linesError) throw linesError;
    if (approvalsError) throw approvalsError;

    const lineIds = (lines ?? []).map((line) => line.line_item_id);
    const { data: attachments, error: attachmentsError } = lineIds.length
      ? await db.from("expense_attachments").select("*").in("line_item_id", lineIds)
      : { data: [], error: null };

    if (attachmentsError) throw attachmentsError;

    const attachmentsByLineId = new Map<string, ExpenseAttachment[]>();
    for (const attachment of attachments ?? []) {
      const lineId = String(attachment.line_item_id);
      const mapped: ExpenseAttachment = {
        attachmentId: String(attachment.attachment_id),
        lineItemId: lineId,
        storagePath: String(attachment.storage_path),
        contentHash: String(attachment.content_hash),
        originalFileName: String(attachment.original_file_name),
        fileSizeBytes: Number(attachment.file_size_bytes),
        contentType: String(attachment.content_type),
        uploadedAt: String(attachment.uploaded_at),
        uploadedByUserId: String(attachment.uploaded_by_user_id)
      };
      attachmentsByLineId.set(lineId, [...(attachmentsByLineId.get(lineId) ?? []), mapped]);
    }

    return {
      ...mapClaim(claim as ClaimRow),
      lineItems: (lines ?? []).map((line) => ({
        ...mapLineItem(line),
        attachments: attachmentsByLineId.get(String(line.line_item_id)) ?? []
      })),
      approvalSteps: (approvals ?? []).map((step) => ({
        stepId: String(step.step_id),
        claimId: String(step.claim_id),
        stepOrder: Number(step.step_order),
        requiredApproverRole: step.required_approver_role as ApprovalStep["requiredApproverRole"],
        assignedApproverId: step.assigned_approver_id ? String(step.assigned_approver_id) : null,
        decision: step.decision as ApprovalStep["decision"],
        decisionAt: step.decision_at ? String(step.decision_at) : null,
        remarks: step.remarks ? String(step.remarks) : null
      }))
    };
  }

  async createClaim(input: CreateClaimRecord): Promise<ExpenseClaim> {
    const db = await getSupabaseAdminClient();
    const claim = defaultClaimRecord(input, randomUUID(), new Date().toISOString());
    const { data, error } = await db
      .from("expense_claims")
      .insert({
        claim_id: claim.claimId,
        submitter_employee_id: claim.submitterEmployeeId,
        submission_mode: claim.submissionMode,
        proforma_period_start: claim.proformaPeriodStart,
        proforma_period_end: claim.proformaPeriodEnd,
        status: claim.status,
        total_amount: claim.totalAmount,
        site_id: claim.siteId,
        created_at: claim.createdAt,
        updated_at: claim.updatedAt
      })
      .select("*")
      .single();

    if (error) throw error;
    return mapClaim(data as ClaimRow);
  }

  async addLineItem(claimId: string, input: CreateLineItemInput): Promise<ExpenseLineItem> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_line_items")
      .insert({
        line_item_id: randomUUID(),
        claim_id: claimId,
        description: input.description,
        amount: input.amount,
        transaction_date: input.transactionDate,
        expense_tag: input.expenseTag,
        client_invoice_number: input.clientInvoiceNumber ?? null,
        invoice_validation_status: input.expenseTag === "AlreadyBilled" ? "PendingErpValidation" : "NotApplicable",
        site_id: input.siteId ?? null,
        missing_receipt_flag: true,
        sort_order: input.sortOrder
      })
      .select("*")
      .single();

    if (error) throw error;
    await this.updateClaimTotal(claimId);
    return mapLineItem(data);
  }

  async submitClaim(claimId: string, nextStatus: ClaimStatus): Promise<ExpenseClaim> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_claims")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("claim_id", claimId)
      .select("*")
      .single();

    if (error) throw error;
    return mapClaim(data as ClaimRow);
  }

  async updateClaimTotal(claimId: string): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_line_items")
      .select("amount")
      .eq("claim_id", claimId)
      .eq("is_deleted", false);

    if (error) throw error;

    const total = (data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
    const { error: updateError } = await db
      .from("expense_claims")
      .update({ total_amount: total, updated_at: new Date().toISOString() })
      .eq("claim_id", claimId);

    if (updateError) throw updateError;
  }

  async createApprovalSteps(
    steps: Omit<ApprovalStep, "stepId" | "decision" | "decisionAt" | "remarks">[]
  ): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { error } = await db.from("approval_steps").insert(
      steps.map((step) => ({
        step_id: randomUUID(),
        claim_id: step.claimId,
        step_order: step.stepOrder,
        required_approver_role: step.requiredApproverRole,
        assigned_approver_id: step.assignedApproverId,
        decision: "Pending"
      }))
    );

    if (error) throw error;
  }

  async appendAuditLog(input: AuditLogInput): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { error } = await db.from("audit_log").insert({
      claim_id: input.claimId,
      actor_user_id: input.actorUserId,
      action_type: input.actionType,
      pre_action_status: input.preActionStatus,
      post_action_status: input.postActionStatus,
      audit_remarks: input.auditRemarks ?? null,
      correlation_id: input.correlationId
    });

    if (error) throw error;
  }

  async getEmployee(employeeId: string): Promise<Employee | null> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db.from("employees").select("*").eq("employee_id", employeeId).single();
    if (error && error.code !== "PGRST116") throw error;
    if (!data) return null;

    return {
      employeeId: String(data.employee_id),
      fullName: String(data.full_name),
      email: String(data.email),
      role: data.role as Employee["role"],
      directManagerId: data.direct_manager_id ? String(data.direct_manager_id) : null,
      isHod: Boolean(data.is_hod),
      approvalThresholdAmount: Number(data.approval_threshold_amount),
      isActive: Boolean(data.is_active)
    };
  }

  async findManagingDirector(): Promise<Employee | null> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db.from("employees").select("*").eq("role", "MD").eq("is_active", true).limit(1);
    if (error) throw error;
    const employee = data?.[0];
    if (!employee) return null;
    return this.getEmployee(String(employee.employee_id));
  }
}

export function assertClaimExists<T>(claim: T | null): T {
  if (!claim) {
    throw notFound("Claim was not found.");
  }
  return claim;
}
