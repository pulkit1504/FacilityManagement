import { randomUUID } from "node:crypto";
import { notFound } from "../errors/application-error";
import type {
  ApprovalStep,
  ApprovalQueueItem,
  BillingAlert,
  BillingAlertQueueItem,
  ClaimDetail,
  ClaimStatus,
  Employee,
  FinanceQueueItem,
  ExpenseAttachment,
  ExpenseClaim,
  ExpenseLineItem,
  FraudFlag,
  FraudFlagQueueItem,
  FraudFlagStatus,
  OverviewMetrics
} from "../domain/types";
import type {
  AuditLogInput,
  ClaimRepository,
  CreateAttachmentRecord,
  CreateBillingAlertRecord,
  CreateFraudFlagRecord,
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

function mapBillingAlert(row: Record<string, unknown>): BillingAlert {
  return {
    alertId: String(row.alert_id),
    lineItemId: String(row.line_item_id),
    claimId: String(row.claim_id),
    createdAt: String(row.created_at),
    lastSentAt: row.last_sent_at ? String(row.last_sent_at) : null,
    nextSendAt: String(row.next_send_at),
    escalationLevel: Number(row.escalation_level) === 1 ? 1 : 0,
    alertsSentCount: Number(row.alerts_sent_count),
    isResolved: Boolean(row.is_resolved),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    resolvedByUserId: row.resolved_by_user_id ? String(row.resolved_by_user_id) : null
  };
}

function parseRelatedClaimIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function mapFraudFlag(row: Record<string, unknown>): FraudFlag {
  return {
    flagId: String(row.flag_id),
    primaryClaimId: String(row.primary_claim_id),
    relatedClaimIds: parseRelatedClaimIds(row.related_claim_ids),
    ruleName: row.rule_name as FraudFlag["ruleName"],
    flaggedAt: String(row.flagged_at),
    sweepDate: String(row.sweep_date),
    status: row.status as FraudFlagStatus,
    reviewedByUserId: row.reviewed_by_user_id ? String(row.reviewed_by_user_id) : null,
    reviewRemarks: row.review_remarks ? String(row.review_remarks) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null
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
        client_invoice_number: input.expenseTag === "AlreadyBilled" ? input.clientInvoiceNumber ?? null : null,
        invoice_validation_status: input.expenseTag === "AlreadyBilled" ? "PendingErpValidation" : "NotApplicable",
        site_id: input.expenseTag === "ContractPartCost" ? input.siteId ?? null : null,
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

  async listApprovalQueue(userId: string, role: string): Promise<ApprovalQueueItem[]> {
    const db = await getSupabaseAdminClient();
    let query = db
      .from("approval_steps")
      .select("claim_id")
      .eq("decision", "Pending")
      .order("step_order");

    if (role !== "Finance" && role !== "FinanceHOD") {
      query = query.eq("assigned_approver_id", userId);
    } else {
      query = query.eq("required_approver_role", "Finance");
    }

    const { data, error } = await query.limit(50);
    if (error) throw error;

    const items = await Promise.all(
      (data ?? []).map(async (step) => {
        const detail = await this.getClaimDetail(String(step.claim_id));
        return detail ? this.toApprovalQueueItem(detail) : null;
      })
    );

    return items.filter((item): item is ApprovalQueueItem => Boolean(item));
  }

  async listFinanceQueue(): Promise<FinanceQueueItem[]> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_claims")
      .select("claim_id")
      .in("status", ["HodApproved", "MdApproved", "FinanceConfirmed"])
      .eq("is_deleted", false)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const items = await Promise.all(
      (data ?? []).map(async (row) => {
        const detail = await this.getClaimDetail(String(row.claim_id));
        if (!detail) return null;
        const pendingBillingItemCount = detail.lineItems.filter((item) => item.expenseTag === "PendingBilling").length;
        return {
          ...this.toApprovalQueueItem(detail),
          physicalReceiptRequired: true,
          physicalReceiptConfirmed: Boolean(detail.physicalReceiptConfirmedAt),
          hasPendingBillingItems: pendingBillingItemCount > 0,
          pendingBillingItemCount
        };
      })
    );

    return items.filter((item): item is FinanceQueueItem => Boolean(item));
  }

  async getPendingApprovalStep(claimId: string): Promise<ApprovalStep | null> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("approval_steps")
      .select("*")
      .eq("claim_id", claimId)
      .eq("decision", "Pending")
      .order("step_order")
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      stepId: String(data.step_id),
      claimId: String(data.claim_id),
      stepOrder: Number(data.step_order),
      requiredApproverRole: data.required_approver_role as ApprovalStep["requiredApproverRole"],
      assignedApproverId: data.assigned_approver_id ? String(data.assigned_approver_id) : null,
      decision: data.decision as ApprovalStep["decision"],
      decisionAt: data.decision_at ? String(data.decision_at) : null,
      remarks: data.remarks ? String(data.remarks) : null
    };
  }

  async decideApprovalStep(stepId: string, decision: "Approved" | "Rejected", remarks?: string | null): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { error } = await db
      .from("approval_steps")
      .update({
        decision,
        decision_at: new Date().toISOString(),
        remarks: remarks ?? null
      })
      .eq("step_id", stepId);

    if (error) throw error;
  }

  async rejectClaim(claimId: string, reason: string): Promise<ExpenseClaim> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_claims")
      .update({
        status: "Rejected",
        rejection_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq("claim_id", claimId)
      .select("*")
      .single();

    if (error) throw error;
    return mapClaim(data as ClaimRow);
  }

  async confirmPhysicalReceipt(claimId: string, confirmedAt: string, confirmedBy: string): Promise<ExpenseClaim> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_claims")
      .update({
        physical_receipt_confirmed_at: confirmedAt,
        physical_receipt_confirmed_by: confirmedBy,
        updated_at: new Date().toISOString()
      })
      .eq("claim_id", claimId)
      .select("*")
      .single();

    if (error) throw error;
    return mapClaim(data as ClaimRow);
  }

  async createFinanceApprovalStep(claimId: string): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { error } = await db.from("approval_steps").insert({
      step_id: randomUUID(),
      claim_id: claimId,
      step_order: 2,
      required_approver_role: "Finance",
      assigned_approver_id: null,
      decision: "Pending"
    });

    if (error) throw error;
  }

  async createAttachment(input: CreateAttachmentRecord): Promise<ExpenseAttachment> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_attachments")
      .insert({
        attachment_id: randomUUID(),
        line_item_id: input.lineItemId,
        storage_path: input.storagePath,
        content_hash: input.contentHash,
        original_file_name: input.originalFileName,
        file_size_bytes: input.fileSizeBytes,
        content_type: input.contentType,
        uploaded_by_user_id: input.uploadedByUserId
      })
      .select("*")
      .single();

    if (error) throw error;

    return {
      attachmentId: String(data.attachment_id),
      lineItemId: String(data.line_item_id),
      storagePath: String(data.storage_path),
      contentHash: String(data.content_hash),
      originalFileName: String(data.original_file_name),
      fileSizeBytes: Number(data.file_size_bytes),
      contentType: String(data.content_type),
      uploadedAt: String(data.uploaded_at),
      uploadedByUserId: String(data.uploaded_by_user_id)
    };
  }

  async getAttachment(attachmentId: string): Promise<ExpenseAttachment | null> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_attachments")
      .select("*")
      .eq("attachment_id", attachmentId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      attachmentId: String(data.attachment_id),
      lineItemId: String(data.line_item_id),
      storagePath: String(data.storage_path),
      contentHash: String(data.content_hash),
      originalFileName: String(data.original_file_name),
      fileSizeBytes: Number(data.file_size_bytes),
      contentType: String(data.content_type),
      uploadedAt: String(data.uploaded_at),
      uploadedByUserId: String(data.uploaded_by_user_id)
    };
  }

  async clearMissingReceiptFlag(lineItemId: string): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { error } = await db
      .from("expense_line_items")
      .update({ missing_receipt_flag: false })
      .eq("line_item_id", lineItemId);

    if (error) throw error;
  }

  async createBillingAlert(input: CreateBillingAlertRecord): Promise<BillingAlert | null> {
    const db = await getSupabaseAdminClient();
    const { data: existing, error: existingError } = await db
      .from("billing_alerts")
      .select("*")
      .eq("line_item_id", input.lineItemId)
      .eq("is_resolved", false)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return null;

    const { data, error } = await db
      .from("billing_alerts")
      .insert({
        alert_id: randomUUID(),
        line_item_id: input.lineItemId,
        claim_id: input.claimId,
        next_send_at: input.nextSendAt,
        escalation_level: 0,
        alerts_sent_count: 0,
        is_resolved: false
      })
      .select("*")
      .single();

    if (error) throw error;

    const { error: lineError } = await db
      .from("expense_line_items")
      .update({ billing_alert_created: true })
      .eq("line_item_id", input.lineItemId);

    if (lineError) throw lineError;
    return mapBillingAlert(data);
  }

  async listBillingAlerts(isResolved = false): Promise<BillingAlertQueueItem[]> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("billing_alerts")
      .select("*")
      .eq("is_resolved", isResolved)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    const items = await Promise.all(
      (data ?? []).map(async (row) => {
        const alert = mapBillingAlert(row);
        const detail = await this.getClaimDetail(alert.claimId);
        const lineItem = detail?.lineItems.find((item) => item.lineItemId === alert.lineItemId);
        const daysOpen = Math.max(0, Math.floor((Date.now() - new Date(alert.createdAt).getTime()) / 86_400_000));

        return {
          ...alert,
          lineItemDescription: lineItem?.description ?? "Line item unavailable",
          amount: lineItem?.amount ?? 0,
          claimantName: detail?.submitterEmployeeId ?? "Unknown",
          siteName: detail?.siteId ?? null,
          daysOpen,
          urgencyLabel:
            daysOpen >= 7 ? "Escalate to Finance HOD" : daysOpen >= 2 ? "Needs billing follow-up" : "Within 48-hour window"
        };
      })
    );

    return items;
  }

  async getBillingAlert(alertId: string): Promise<BillingAlert | null> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("billing_alerts")
      .select("*")
      .eq("alert_id", alertId)
      .maybeSingle();

    if (error) throw error;
    return data ? mapBillingAlert(data) : null;
  }

  async linkInvoiceToBillingAlert(
    alertId: string,
    invoiceNumber: string,
    resolvedByUserId: string
  ): Promise<BillingAlert> {
    const db = await getSupabaseAdminClient();
    const alert = await this.getBillingAlert(alertId);
    if (!alert) {
      throw notFound("Billing alert was not found.");
    }

    const { error: lineError } = await db
      .from("expense_line_items")
      .update({
        expense_tag: "AlreadyBilled",
        client_invoice_number: invoiceNumber,
        invoice_validation_status: "Valid"
      })
      .eq("line_item_id", alert.lineItemId);

    if (lineError) throw lineError;

    const { data, error } = await db
      .from("billing_alerts")
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by_user_id: resolvedByUserId
      })
      .eq("alert_id", alertId)
      .select("*")
      .single();

    if (error) throw error;
    return mapBillingAlert(data);
  }

  async listClaimsForFraudSweep(): Promise<ClaimDetail[]> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_claims")
      .select("claim_id")
      .in("status", ["FinanceConfirmed", "PaymentReleased"])
      .eq("is_deleted", false)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const claims = await Promise.all(
      (data ?? []).map(async (row) => this.getClaimDetail(String(row.claim_id)))
    );

    return claims.filter((claim): claim is ClaimDetail => Boolean(claim));
  }

  async createFraudFlag(input: CreateFraudFlagRecord): Promise<FraudFlag | null> {
    const db = await getSupabaseAdminClient();
    const { data: existing, error: existingError } = await db
      .from("fraud_flags")
      .select("*")
      .eq("primary_claim_id", input.primaryClaimId)
      .eq("rule_name", input.ruleName)
      .eq("status", "Open")
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return null;

    const { data, error } = await db
      .from("fraud_flags")
      .insert({
        flag_id: randomUUID(),
        primary_claim_id: input.primaryClaimId,
        related_claim_ids: input.relatedClaimIds,
        rule_name: input.ruleName,
        sweep_date: input.sweepDate,
        status: "Open"
      })
      .select("*")
      .single();

    if (error) throw error;
    return mapFraudFlag(data);
  }

  async listFraudFlags(status: FraudFlagStatus = "Open"): Promise<FraudFlagQueueItem[]> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("fraud_flags")
      .select("*")
      .eq("status", status)
      .order("flagged_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const labels: Record<FraudFlag["ruleName"], { label: string; description: string }> = {
      DuplicateVoucher: {
        label: "Duplicate Voucher Suspected",
        description: "Matching amount and transaction date found across claims."
      },
      ThresholdSplit: {
        label: "Threshold Split Suspected",
        description: "Multiple claims appear sized just below an approval threshold."
      },
      WeekendOutlier: {
        label: "Non-Operational Day",
        description: "Backend CTC expense occurred on a weekend or configured holiday."
      }
    };

    return Promise.all(
      (data ?? []).map(async (row) => {
        const flag = mapFraudFlag(row);
        const claim = await this.getClaimDetail(flag.primaryClaimId);
        const daysOpen = Math.max(0, Math.floor((Date.now() - new Date(flag.flaggedAt).getTime()) / 86_400_000));
        const ruleText = labels[flag.ruleName];

        return {
          ...flag,
          ruleLabel: ruleText.label,
          ruleDescription: ruleText.description,
          relatedClaimCount: flag.relatedClaimIds.length,
          daysOpen,
          employeeName: claim?.submitterEmployeeId ?? "Unknown"
        };
      })
    );
  }

  async reviewFraudFlag(
    flagId: string,
    status: Exclude<FraudFlagStatus, "Open">,
    remarks: string,
    reviewedByUserId: string
  ): Promise<FraudFlag> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("fraud_flags")
      .update({
        status,
        review_remarks: remarks,
        reviewed_by_user_id: reviewedByUserId,
        reviewed_at: new Date().toISOString()
      })
      .eq("flag_id", flagId)
      .select("*")
      .single();

    if (error) throw error;
    return mapFraudFlag(data);
  }

  async listHolidayDates(): Promise<string[]> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db.from("holidays").select("holiday_date");

    if (error) throw error;
    return (data ?? []).map((row) => String(row.holiday_date));
  }

  async getOverviewMetrics(userId: string, role: string): Promise<OverviewMetrics> {
    const db = await getSupabaseAdminClient();
    const approvalQueue = await this.listApprovalQueue(userId, role);
    const financeQueue = ["Finance", "FinanceHOD"].includes(role) ? await this.listFinanceQueue() : [];

    const [
      { count: activeBillingAlerts, error: billingAlertError },
      { count: openFraudFlags, error: fraudFlagError },
      { data: approvedClaims, error: approvedClaimsError }
    ] = await Promise.all([
      db.from("billing_alerts").select("alert_id", { count: "exact", head: true }).eq("is_resolved", false),
      db.from("fraud_flags").select("flag_id", { count: "exact", head: true }).eq("status", "Open"),
      db
        .from("expense_claims")
        .select("claim_id")
        .in("status", ["FinanceConfirmed", "PaymentReleased"])
        .eq("is_deleted", false)
        .limit(500)
    ]);

    if (billingAlertError) throw billingAlertError;
    if (fraudFlagError) throw fraudFlagError;
    if (approvedClaimsError) throw approvedClaimsError;

    const claimDetails = await Promise.all(
      (approvedClaims ?? []).map(async (row) => this.getClaimDetail(String(row.claim_id)))
    );

    let totalBillable = 0;
    let totalBilled = 0;
    for (const claim of claimDetails.filter((item): item is ClaimDetail => Boolean(item))) {
      for (const line of claim.lineItems) {
        if (line.expenseTag === "AlreadyBilled" || line.expenseTag === "PendingBilling") {
          totalBillable += line.amount;
        }
        if (line.expenseTag === "AlreadyBilled" && line.invoiceValidationStatus === "Valid") {
          totalBilled += line.amount;
        }
      }
    }

    return {
      pendingApprovals: approvalQueue.length,
      financeQueueCount: financeQueue.length,
      activeBillingAlerts: activeBillingAlerts ?? 0,
      openFraudFlags: openFraudFlags ?? 0,
      billingRecoveryPct: totalBillable > 0 ? Math.round((totalBilled / totalBillable) * 100) : null
    };
  }

  private toApprovalQueueItem(claim: ClaimDetail): ApprovalQueueItem {
    const submittedAt = claim.updatedAt ?? claim.createdAt;
    const daysPending = Math.max(
      0,
      Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000)
    );

    return {
      claimId: claim.claimId,
      submittedBy: claim.submitterEmployeeId,
      submittedByRole: "Claimant",
      siteName: claim.siteId,
      totalAmount: claim.totalAmount,
      lineItemCount: claim.lineItems.length,
      missingReceiptCount: claim.lineItems.filter((item) => item.missingReceiptFlag).length,
      submittedAt,
      daysPending,
      urgencyLevel: daysPending > 5 ? "Overdue" : daysPending >= 3 ? "Attention" : "Normal"
    };
  }
}

export function assertClaimExists<T>(claim: T | null): T {
  if (!claim) {
    throw notFound("Claim was not found.");
  }
  return claim;
}
