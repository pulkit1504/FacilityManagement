import { randomUUID } from "node:crypto";
import { notFound } from "../errors/application-error";
import type {
  ApprovalStep,
  ApprovalQueueItem,
  BillableClaimReportRow,
  BillingAlert,
  BillingAlertQueueItem,
  ClaimDetail,
  ClaimStatus,
  ClientContract,
  Employee,
  FinanceQueueItem,
  ExpenseAttachment,
  ExpenseClaim,
  ExpenseLineItem,
  FraudFlag,
  FraudFlagQueueItem,
  FraudFlagStatus,
  Holiday,
  ImprestLedgerReportRow,
  MisDashboardMetrics,
  NotificationOutboxInput,
  OverviewMetrics,
  PendingAdvanceItem,
  Site
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
import type { CreateContractInput, CreateEmployeeInput, CreateHolidayInput, CreateSiteInput } from "../validation/claim.schemas";
import { getSupabaseAdminClient } from "./supabase-client";
import { hashPassword, verifyPassword } from "../auth/password";

type ClaimRow = {
  claim_id: string;
  ticket_id: string | null;
  submitter_employee_id: string;
  claim_kind: string | null;
  submission_mode: string;
  proforma_period_start: string | null;
  proforma_period_end: string | null;
  claim_period_month: string | null;
  advance_claim_id: string | null;
  advance_amount: number | null;
  settled_amount: number | null;
  advance_balance: number | null;
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
    ticketId: row.ticket_id ?? `EXP-${row.claim_id.slice(0, 8).toUpperCase()}`,
    submitterEmployeeId: row.submitter_employee_id,
    claimKind: (row.claim_kind ?? "Reimbursement") as ExpenseClaim["claimKind"],
    submissionMode: row.submission_mode as ExpenseClaim["submissionMode"],
    proformaPeriodStart: row.proforma_period_start,
    proformaPeriodEnd: row.proforma_period_end,
    claimPeriodMonth: row.claim_period_month,
    advanceClaimId: row.advance_claim_id,
    advanceAmount: Number(row.advance_amount ?? 0),
    settledAmount: Number(row.settled_amount ?? 0),
    advanceBalance: Number(row.advance_balance ?? 0),
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
    expenseHead: row.expense_head ? String(row.expense_head) : null,
    description: String(row.description),
    amount: Number(row.amount),
    transactionDate: String(row.transaction_date),
    paymentMode: row.payment_mode ? row.payment_mode as ExpenseLineItem["paymentMode"] : null,
    expenseTag: row.expense_tag as ExpenseLineItem["expenseTag"],
    clientInvoiceNumber: row.client_invoice_number ? String(row.client_invoice_number) : null,
    vendorName: row.vendor_name ? String(row.vendor_name) : null,
    vendorInvoiceNumber: row.vendor_invoice_number ? String(row.vendor_invoice_number) : null,
    billableAmount: row.billable_amount === null || row.billable_amount === undefined ? null : Number(row.billable_amount),
    siteOrDepartment: row.site_or_department ? String(row.site_or_department) : null,
    lineTicketId: row.line_ticket_id ? String(row.line_ticket_id) : null,
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

function mapEmployee(row: Record<string, unknown>): Employee {
  return {
    employeeId: String(row.employee_id),
    fullName: String(row.full_name),
    email: String(row.email),
    role: row.role as Employee["role"],
    directManagerId: row.direct_manager_id ? String(row.direct_manager_id) : null,
    isHod: Boolean(row.is_hod),
    approvalThresholdAmount: Number(row.approval_threshold_amount),
    imprestAdvanceLimit: Number(row.imprest_advance_limit ?? 0),
    bankAccountHolderName: row.bank_account_holder_name ? String(row.bank_account_holder_name) : null,
    bankAccountNumber: row.bank_account_number ? String(row.bank_account_number) : null,
    bankIfsc: row.bank_ifsc ? String(row.bank_ifsc) : null,
    bankName: row.bank_name ? String(row.bank_name) : null,
    isActive: Boolean(row.is_active)
  };
}

function mapHoliday(row: Record<string, unknown>): Holiday {
  return {
    holidayDate: String(row.holiday_date),
    holidayName: String(row.holiday_name),
    isNational: Boolean(row.is_national)
  };
}

function isBootstrapLogin(email: string, password: string) {
  return Boolean(
    process.env.AUTH_BOOTSTRAP_EMAIL &&
      process.env.AUTH_BOOTSTRAP_PASSWORD &&
      email.toLowerCase() === process.env.AUTH_BOOTSTRAP_EMAIL.toLowerCase() &&
      password === process.env.AUTH_BOOTSTRAP_PASSWORD
  );
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

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function mapContract(row: Record<string, unknown>): ClientContract {
  return {
    contractId: String(row.contract_id),
    clientName: String(row.client_name),
    description: row.description ? String(row.description) : null,
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : null,
    isActive: Boolean(row.is_active)
  };
}

export class SupabaseClaimRepository implements ClaimRepository {
  private activeSitesPromise: Promise<Site[]> | null = null;

  async listContracts(): Promise<ClientContract[]> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("client_contracts")
      .select("*")
      .order("client_name");

    if (error) throw error;
    return (data ?? []).map(mapContract);
  }

  async createContract(input: CreateContractInput): Promise<ClientContract> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("client_contracts")
      .insert({
        contract_id: `ctr-${slugify(input.clientName)}-${randomUUID().slice(0, 8)}`,
        client_name: input.clientName,
        description: input.description ?? null,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        is_active: true
      })
      .select("*")
      .single();

    if (error) throw error;
    return mapContract(data);
  }

  async listActiveSites(): Promise<Site[]> {
    this.activeSitesPromise ??= this.fetchActiveSites();
    try {
      return await this.activeSitesPromise;
    } catch (error) {
      this.activeSitesPromise = null;
      throw error;
    }
  }

  private async fetchActiveSites(): Promise<Site[]> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("sites")
      .select("site_id, site_name, site_address, service_type, contract_id, cluster_head_employee_id, client_contracts(client_name, description)")
      .eq("is_active", true)
      .order("site_name");

    if (error) throw error;

    return (data ?? []).map((row) => {
      const contract = Array.isArray(row.client_contracts) ? row.client_contracts[0] : row.client_contracts;
      return {
        siteId: String(row.site_id),
        siteName: String(row.site_name),
        siteAddress: row.site_address ? String(row.site_address) : null,
        serviceType: row.service_type as Site["serviceType"],
        contractId: row.contract_id ? String(row.contract_id) : null,
        clientName: contract?.client_name ? String(contract.client_name) : null,
        contractDescription: contract?.description ? String(contract.description) : null,
        clusterHeadEmployeeId: row.cluster_head_employee_id ? String(row.cluster_head_employee_id) : null,
        clusterHeadName: null
      };
    });
  }

  async createSite(input: CreateSiteInput): Promise<Site> {
    const db = await getSupabaseAdminClient();
    const siteId = `site-${slugify(input.siteName)}-${randomUUID().slice(0, 8)}`;
    const { error } = await db
      .from("sites")
      .insert({
        site_id: siteId,
        site_name: input.siteName,
        site_address: input.siteAddress ?? null,
        service_type: input.serviceType,
        contract_id: input.contractId,
        cluster_head_employee_id: input.clusterHeadEmployeeId ?? null,
        is_active: true
      });

    if (error) throw error;
    this.activeSitesPromise = null;
    const sites = await this.listActiveSites();
    return sites.find((site) => site.siteId === siteId) ?? {
      siteId,
      siteName: input.siteName,
      siteAddress: input.siteAddress ?? null,
      serviceType: input.serviceType,
      contractId: input.contractId,
      clientName: null,
      contractDescription: null,
      clusterHeadEmployeeId: input.clusterHeadEmployeeId ?? null,
      clusterHeadName: null
    };
  }

  async deactivateSite(siteId: string): Promise<Site> {
    const db = await getSupabaseAdminClient();
    const { error } = await db.from("sites").update({ is_active: false }).eq("site_id", siteId);
    if (error) throw error;
    this.activeSitesPromise = null;

    return {
      siteId,
      siteName: siteId,
      siteAddress: null,
      serviceType: "Both",
      contractId: null,
      clientName: null,
      contractDescription: null,
      clusterHeadEmployeeId: null,
      clusterHeadName: null
    };
  }

  async listEmployees(): Promise<Employee[]> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db.from("employees").select("*").eq("is_active", true).order("full_name");

    if (error) throw error;
    return (data ?? []).map(mapEmployee);
  }

  async createEmployee(input: CreateEmployeeInput): Promise<Employee> {
    const db = await getSupabaseAdminClient();
    const passwordHash = input.temporaryPassword ? await hashPassword(input.temporaryPassword) : undefined;
    const { data, error } = await db
      .from("employees")
      .upsert(
        {
          employee_id: input.employeeId,
          full_name: input.fullName,
          email: input.email,
          role: input.role,
          direct_manager_id: input.directManagerId ?? null,
          is_hod: input.isHod,
          approval_threshold_amount: input.approvalThresholdAmount,
          imprest_advance_limit: input.imprestAdvanceLimit,
          bank_account_holder_name: input.bankAccountHolderName ?? null,
          bank_account_number: input.bankAccountNumber ?? null,
          bank_ifsc: input.bankIfsc ?? null,
          bank_name: input.bankName ?? null,
          ...(passwordHash ? { password_hash: passwordHash } : {}),
          is_active: true
        },
        { onConflict: "employee_id" }
      )
      .select("*")
      .single();

    if (error) throw error;
    return mapEmployee(data);
  }

  async deactivateEmployee(employeeId: string): Promise<Employee> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("employees")
      .update({ is_active: false })
      .eq("employee_id", employeeId)
      .select("*")
      .single();

    if (error) throw error;
    return mapEmployee(data);
  }

  async listHolidays(): Promise<Holiday[]> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db.from("holidays").select("*").order("holiday_date", { ascending: true });

    if (error) throw error;
    return (data ?? []).map(mapHoliday);
  }

  async createHoliday(input: CreateHolidayInput): Promise<Holiday> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("holidays")
      .upsert(
        {
          holiday_date: input.holidayDate,
          holiday_name: input.holidayName,
          is_national: input.isNational
        },
        { onConflict: "holiday_date" }
      )
      .select("*")
      .single();

    if (error) throw error;
    return mapHoliday(data);
  }

  async deleteHoliday(holidayDate: string): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { error } = await db.from("holidays").delete().eq("holiday_date", holidayDate);
    if (error) throw error;
  }

  async listClaimsForUser(userId: string, role: string): Promise<ExpenseClaim[]> {
    const db = await getSupabaseAdminClient();
    let query = db.from("expense_claims").select("*").eq("is_deleted", false).order("created_at", {
      ascending: false
    });

    if (role === "Claimant" || role === "HOD") {
      query = query.eq("submitter_employee_id", userId);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      throw error;
    }

    return (data as ClaimRow[]).map(mapClaim);
  }

  async getClaimDetail(claimId: string): Promise<ClaimDetail | null> {
    const [claim] = await this.getClaimDetails([claimId]);
    return claim ?? null;
  }

  private async getClaimDetails(claimIds: string[]): Promise<ClaimDetail[]> {
    const uniqueClaimIds = [...new Set(claimIds)].filter(Boolean);
    if (uniqueClaimIds.length === 0) return [];

    const db = await getSupabaseAdminClient();
    const [
      { data: claims, error: claimsError },
      { data: lines, error: linesError },
      { data: approvals, error: approvalsError }
    ] = await Promise.all([
      db.from("expense_claims").select("*").in("claim_id", uniqueClaimIds).eq("is_deleted", false),
      db.from("expense_line_items").select("*").in("claim_id", uniqueClaimIds).eq("is_deleted", false).order("sort_order"),
      db.from("approval_steps").select("*").in("claim_id", uniqueClaimIds).order("step_order")
    ]);

    if (claimsError) throw claimsError;
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

    const lineItemsByClaimId = new Map<string, ClaimDetail["lineItems"]>();
    for (const line of lines ?? []) {
      const claimId = String(line.claim_id);
      lineItemsByClaimId.set(claimId, [
        ...(lineItemsByClaimId.get(claimId) ?? []),
        {
          ...mapLineItem(line),
          attachments: attachmentsByLineId.get(String(line.line_item_id)) ?? []
        }
      ]);
    }

    const approvalsByClaimId = new Map<string, ApprovalStep[]>();
    for (const step of approvals ?? []) {
      const claimId = String(step.claim_id);
      approvalsByClaimId.set(claimId, [
        ...(approvalsByClaimId.get(claimId) ?? []),
        {
          stepId: String(step.step_id),
          claimId: String(step.claim_id),
          stepOrder: Number(step.step_order),
          requiredApproverRole: step.required_approver_role as ApprovalStep["requiredApproverRole"],
          assignedApproverId: step.assigned_approver_id ? String(step.assigned_approver_id) : null,
          decision: step.decision as ApprovalStep["decision"],
          decisionAt: step.decision_at ? String(step.decision_at) : null,
          remarks: step.remarks ? String(step.remarks) : null
        }
      ]);
    }

    const claimById = new Map(
      (claims ?? []).map((claim) => {
        const mappedClaim = mapClaim(claim as ClaimRow);
        return [
          mappedClaim.claimId,
          {
            ...mappedClaim,
            lineItems: lineItemsByClaimId.get(mappedClaim.claimId) ?? [],
            approvalSteps: approvalsByClaimId.get(mappedClaim.claimId) ?? []
          } satisfies ClaimDetail
        ];
      })
    );

    return uniqueClaimIds.map((claimId) => claimById.get(claimId)).filter((claim): claim is ClaimDetail => Boolean(claim));
  }

  async createClaim(input: CreateClaimRecord): Promise<ExpenseClaim> {
    const db = await getSupabaseAdminClient();
    const claim = defaultClaimRecord(input, randomUUID(), new Date().toISOString());
    const { data, error } = await db
      .from("expense_claims")
      .insert({
        claim_id: claim.claimId,
        ticket_id: claim.ticketId,
        submitter_employee_id: claim.submitterEmployeeId,
        claim_kind: claim.claimKind,
        submission_mode: claim.submissionMode,
        proforma_period_start: claim.proformaPeriodStart,
        proforma_period_end: claim.proformaPeriodEnd,
        claim_period_month: claim.claimPeriodMonth,
        advance_claim_id: claim.advanceClaimId,
        advance_amount: claim.advanceAmount,
        settled_amount: claim.settledAmount,
        advance_balance: claim.advanceBalance,
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
        expense_head: input.expenseHead ?? null,
        description: input.description,
        amount: input.amount,
        transaction_date: input.transactionDate,
        payment_mode: input.paymentMode ?? null,
        expense_tag: input.expenseTag,
        client_invoice_number: input.expenseTag === "AlreadyBilled" ? input.clientInvoiceNumber ?? null : null,
        vendor_name: input.vendorName ?? null,
        vendor_invoice_number: input.vendorInvoiceNumber ?? null,
        billable_amount: input.expenseTag === "PendingBilling" ? input.billableAmount ?? input.amount : input.billableAmount ?? null,
        site_or_department: input.siteOrDepartment ?? null,
        line_ticket_id: input.lineTicketId ?? null,
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

  async updateLineItem(claimId: string, lineItemId: string, input: CreateLineItemInput): Promise<ExpenseLineItem> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_line_items")
      .update({
        description: input.description,
        amount: input.amount,
        transaction_date: input.transactionDate,
        expense_head: input.expenseHead ?? null,
        payment_mode: input.paymentMode ?? null,
        expense_tag: input.expenseTag,
        client_invoice_number: input.expenseTag === "AlreadyBilled" ? input.clientInvoiceNumber ?? null : null,
        vendor_name: input.vendorName ?? null,
        vendor_invoice_number: input.vendorInvoiceNumber ?? null,
        billable_amount: input.expenseTag === "PendingBilling" ? input.billableAmount ?? input.amount : input.billableAmount ?? null,
        site_or_department: input.siteOrDepartment ?? null,
        line_ticket_id: input.lineTicketId ?? null,
        invoice_validation_status: input.expenseTag === "AlreadyBilled" ? "PendingErpValidation" : "NotApplicable",
        site_id: input.expenseTag === "ContractPartCost" ? input.siteId ?? null : null,
        sort_order: input.sortOrder
      })
      .eq("claim_id", claimId)
      .eq("line_item_id", lineItemId)
      .eq("is_deleted", false)
      .select("*")
      .single();

    if (error) throw error;
    await this.updateClaimTotal(claimId);
    return mapLineItem(data);
  }

  async deleteLineItem(claimId: string, lineItemId: string): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { error } = await db
      .from("expense_line_items")
      .update({ is_deleted: true })
      .eq("claim_id", claimId)
      .eq("line_item_id", lineItemId)
      .eq("is_deleted", false);

    if (error) throw error;
    await this.updateClaimTotal(claimId);
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
    const { data: claim, error: claimError } = await db
      .from("expense_claims")
      .select("claim_kind,settled_amount")
      .eq("claim_id", claimId)
      .single();

    if (claimError) throw claimError;

    const isAdvance = claim?.claim_kind === "Advance";
    const settledAmount = Number(claim?.settled_amount ?? 0);
    const { error: updateError } = await db
      .from("expense_claims")
      .update({
        total_amount: total,
        ...(isAdvance
          ? {
              advance_amount: total,
              advance_balance: Math.max(0, total - settledAmount)
            }
          : {}),
        updated_at: new Date().toISOString()
      })
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

    return mapEmployee(data);
  }

  async getEmployeeByEmail(email: string): Promise<Employee | null> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("employees")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    return data ? mapEmployee(data) : null;
  }

  async authenticateEmployee(email: string, password: string): Promise<Employee | null> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("employees")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return null;
    }

    const employee = mapEmployee(data);
    const storedHash = data.password_hash ? String(data.password_hash) : null;
    if (await verifyPassword(password, storedHash)) {
      return employee;
    }

    if (!storedHash && isBootstrapLogin(employee.email, password)) {
      return employee;
    }

    return null;
  }

  async findManagingDirector(): Promise<Employee | null> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db.from("employees").select("*").eq("role", "MD").eq("is_active", true).limit(1);
    if (error) throw error;
    const employee = data?.[0];
    if (!employee) return null;
    return this.getEmployee(String(employee.employee_id));
  }

  async enqueueNotification(input: NotificationOutboxInput): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { error } = await db.from("notification_outbox").insert({
      notification_id: randomUUID(),
      recipient_employee_id: input.recipientEmployeeId,
      recipient_email: input.recipientEmail,
      subject: input.subject,
      body: input.body,
      related_claim_id: input.relatedClaimId,
      status: "Queued"
    });

    if (error) throw error;
  }

  async listApprovalQueue(userId: string, role: string): Promise<ApprovalQueueItem[]> {
    if (!["ClusterHead", "HOD", "MD"].includes(role)) {
      return [];
    }

    const db = await getSupabaseAdminClient();
    let query = db
      .from("approval_steps")
      .select("claim_id")
      .eq("decision", "Pending")
      .order("step_order");

    query = query.eq("assigned_approver_id", userId);

    const { data, error } = await query.limit(50);
    if (error) throw error;
    const siteNames = await this.getSiteNameMap();

    const details = await this.getClaimDetails((data ?? []).map((step) => String(step.claim_id)));
    const items = details
      .filter((detail) => {
        const currentStep = detail.approvalSteps
          .filter((step) => step.decision === "Pending")
          .sort((a, b) => a.stepOrder - b.stepOrder)[0];
        return currentStep?.assignedApproverId === userId && currentStep.requiredApproverRole === role;
      })
      .map((detail) => this.toApprovalQueueItem(detail, siteNames));

    return items.filter((item): item is ApprovalQueueItem => Boolean(item));
  }

  async listFinanceQueue(): Promise<FinanceQueueItem[]> {
    const db = await getSupabaseAdminClient();
    const [{ data, error }, siteNames] = await Promise.all([
      db
        .from("expense_claims")
        .select("claim_id,ticket_id,claim_kind,submitter_employee_id,total_amount,site_id,physical_receipt_confirmed_at,created_at,updated_at")
        .in("status", ["HodApproved", "MdApproved", "FinanceConfirmed"])
        .eq("is_deleted", false)
        .order("updated_at", { ascending: false })
        .limit(50),
      this.getSiteNameMap()
    ]);

    if (error) throw error;
    const claims = data ?? [];
    const lineStats = await this.getQueueLineStats(claims.map((row) => String(row.claim_id)));

    const items: FinanceQueueItem[] = claims.map((claim) => {
      const claimId = String(claim.claim_id);
      const stats = lineStats.get(claimId) ?? {
        lineItemCount: 0,
        missingReceiptCount: 0,
        pendingBillingItemCount: 0
      };
      const submittedAt = String(claim.updated_at ?? claim.created_at);
      const daysPending = Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000));
      const siteId = claim.site_id ? String(claim.site_id) : null;
      return {
        claimId,
        ticketId: claim.ticket_id ? String(claim.ticket_id) : `EXP-${claimId.slice(0, 8).toUpperCase()}`,
        claimKind: (claim.claim_kind ?? "Reimbursement") as FinanceQueueItem["claimKind"],
        submittedBy: String(claim.submitter_employee_id),
        submittedByRole: "Claimant" as const,
        siteName: siteId ? siteNames.get(siteId) ?? siteId : null,
        totalAmount: Number(claim.total_amount),
        lineItemCount: stats.lineItemCount,
        missingReceiptCount: stats.missingReceiptCount,
        submittedAt,
        daysPending,
        urgencyLevel: daysPending > 5 ? "Overdue" as const : daysPending >= 3 ? "Attention" as const : "Normal" as const,
        physicalReceiptRequired: claim.claim_kind !== "Advance",
        physicalReceiptConfirmed: claim.claim_kind === "Advance" || Boolean(claim.physical_receipt_confirmed_at),
        hasPendingBillingItems: stats.pendingBillingItemCount > 0,
        pendingBillingItemCount: stats.pendingBillingItemCount
      };
    });

    return items;
  }

  async listPendingAdvances(userId: string, role: string): Promise<PendingAdvanceItem[]> {
    const db = await getSupabaseAdminClient();
    let query = db
      .from("expense_claims")
      .select("claim_id,ticket_id,submitter_employee_id,site_id,advance_amount,settled_amount,advance_balance,updated_at")
      .eq("claim_kind", "Advance")
      .eq("status", "PaymentReleased")
      .gt("advance_balance", 0)
      .eq("is_deleted", false)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (["Claimant", "HOD"].includes(role)) {
      query = query.eq("submitter_employee_id", userId);
    }

    const [{ data, error }, siteNames] = await Promise.all([query, this.getSiteNameMap()]);
    if (error) throw error;

    return (data ?? []).map((row) => {
      const paidAt = String(row.updated_at);
      const siteId = row.site_id ? String(row.site_id) : null;
      return {
        claimId: String(row.claim_id),
        ticketId: row.ticket_id ? String(row.ticket_id) : `ADV-${String(row.claim_id).slice(0, 8).toUpperCase()}`,
        submittedBy: String(row.submitter_employee_id),
        siteId,
        siteName: siteId ? siteNames.get(siteId) ?? siteId : null,
        advanceAmount: Number(row.advance_amount),
        settledAmount: Number(row.settled_amount),
        advanceBalance: Number(row.advance_balance),
        paidAt,
        ageDays: Math.max(0, Math.floor((Date.now() - new Date(paidAt).getTime()) / 86_400_000))
      };
    });
  }

  async applySettlementToAdvance(settlementClaimId: string): Promise<void> {
    const settlement = await this.getClaimDetail(settlementClaimId);
    if (!settlement?.advanceClaimId || settlement.claimKind !== "Settlement") {
      return;
    }

    const db = await getSupabaseAdminClient();
    const { data: advance, error: advanceError } = await db
      .from("expense_claims")
      .select("advance_amount,settled_amount")
      .eq("claim_id", settlement.advanceClaimId)
      .eq("claim_kind", "Advance")
      .single();

    if (advanceError) throw advanceError;

    const nextSettledAmount = Number(advance.settled_amount ?? 0) + settlement.totalAmount;
    const nextBalance = Math.max(0, Number(advance.advance_amount ?? 0) - nextSettledAmount);
    const { error } = await db
      .from("expense_claims")
      .update({
        settled_amount: nextSettledAmount,
        advance_balance: nextBalance,
        updated_at: new Date().toISOString()
      })
      .eq("claim_id", settlement.advanceClaimId);

    if (error) throw error;
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

  async reopenRejectedClaim(claimId: string): Promise<ExpenseClaim> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_claims")
      .update({
        status: "Draft",
        rejection_reason: null,
        updated_at: new Date().toISOString()
      })
      .eq("claim_id", claimId)
      .eq("status", "Rejected")
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
    const [{ data, error }, siteNames] = await Promise.all([
      db
        .from("billing_alerts")
        .select("*")
        .eq("is_resolved", isResolved)
        .order("created_at", { ascending: true })
        .limit(100),
      this.getSiteNameMap()
    ]);

    if (error) throw error;

    const alerts = (data ?? []).map(mapBillingAlert);
    const lineItemIds = alerts.map((alert) => alert.lineItemId);
    const claimIds = alerts.map((alert) => alert.claimId);
    const [{ data: lineItems, error: lineItemsError }, { data: claims, error: claimsError }] = await Promise.all([
      lineItemIds.length
        ? db
            .from("expense_line_items")
            .select("line_item_id,description,amount")
            .in("line_item_id", lineItemIds)
            .eq("is_deleted", false)
        : { data: [], error: null },
      claimIds.length
        ? db
            .from("expense_claims")
            .select("claim_id,submitter_employee_id,site_id")
            .in("claim_id", claimIds)
            .eq("is_deleted", false)
        : { data: [], error: null }
    ]);

    if (lineItemsError) throw lineItemsError;
    if (claimsError) throw claimsError;

    const lineItemsById = new Map(
      (lineItems ?? []).map((item) => [
        String(item.line_item_id),
        {
          description: String(item.description),
          amount: Number(item.amount)
        }
      ])
    );
    const claimsById = new Map(
      (claims ?? []).map((claim) => [
        String(claim.claim_id),
        {
          submitterEmployeeId: String(claim.submitter_employee_id),
          siteId: claim.site_id ? String(claim.site_id) : null
        }
      ])
    );

    const items = alerts.map((alert) => {
      const claim = claimsById.get(alert.claimId);
      const lineItem = lineItemsById.get(alert.lineItemId);
      const daysOpen = Math.max(0, Math.floor((Date.now() - new Date(alert.createdAt).getTime()) / 86_400_000));

      return {
        ...alert,
        lineItemDescription: lineItem?.description ?? "Line item unavailable",
        amount: lineItem?.amount ?? 0,
        claimantName: claim?.submitterEmployeeId ?? "Unknown",
        siteName: claim?.siteId ? siteNames.get(claim.siteId) ?? claim.siteId : null,
        daysOpen,
        urgencyLabel:
          daysOpen >= 7 ? "Escalate to Finance HOD" : daysOpen >= 2 ? "Needs billing follow-up" : "Within 48-hour window"
      };
    });

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

    return this.getClaimDetails((data ?? []).map((row) => String(row.claim_id)));
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

    const flags = (data ?? []).map(mapFraudFlag);
    const claimIds = flags.flatMap((flag) => [flag.primaryClaimId, ...flag.relatedClaimIds]);
    const claims = await this.getClaimDetails(claimIds);
    const claimsById = new Map(claims.map((claim) => [claim.claimId, claim]));

    return flags.map((flag) => {
      const claim = claimsById.get(flag.primaryClaimId) ?? null;
      const relatedClaims = flag.relatedClaimIds.map((claimId) => claimsById.get(claimId) ?? null);
      const claimGroup = [claim, ...relatedClaims].filter((item): item is ClaimDetail => Boolean(item));
      const daysOpen = Math.max(0, Math.floor((Date.now() - new Date(flag.flaggedAt).getTime()) / 86_400_000));
      const ruleText = labels[flag.ruleName];

      return {
        ...flag,
        ruleLabel: ruleText.label,
        ruleDescription: ruleText.description,
        relatedClaimCount: flag.relatedClaimIds.length,
        daysOpen,
        employeeName: claim?.submitterEmployeeId ?? "Unknown",
        flaggedLineItems: this.findFlaggedLineItems(flag.ruleName, claimGroup)
      };
    });
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
        .in("status", ["HodApproved", "MdApproved", "FinanceConfirmed", "PaymentReleased"])
        .eq("is_deleted", false)
        .limit(500)
    ]);

    if (billingAlertError) throw billingAlertError;
    if (fraudFlagError) throw fraudFlagError;
    if (approvedClaimsError) throw approvedClaimsError;

    const approvedClaimIds = (approvedClaims ?? []).map((claim) => String(claim.claim_id));
    const { data: billingLines, error: billingLinesError } = approvedClaimIds.length
      ? await db
          .from("expense_line_items")
          .select("amount,expense_tag,client_invoice_number")
          .in("claim_id", approvedClaimIds)
          .in("expense_tag", ["AlreadyBilled", "PendingBilling"])
          .eq("is_deleted", false)
          .limit(2_000)
      : { data: [], error: null };

    if (billingLinesError) throw billingLinesError;

    let totalBillable = 0;
    let totalBilled = 0;
    for (const line of billingLines ?? []) {
      const amount = Number(line.amount);
      totalBillable += amount;
      if (line.expense_tag === "AlreadyBilled" && line.client_invoice_number) {
        totalBilled += amount;
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

  async getMisDashboardMetrics(): Promise<MisDashboardMetrics> {
    const db = await getSupabaseAdminClient();
    const [{ data: approvedClaims, error: approvedClaimsError }, { data: billingAlerts, error: billingAlertsError }, siteNames] =
      await Promise.all([
        db
          .from("expense_claims")
          .select("claim_id,site_id")
          .in("status", ["HodApproved", "MdApproved", "FinanceConfirmed", "PaymentReleased"])
          .eq("is_deleted", false)
          .limit(500),
        db
          .from("billing_alerts")
          .select("created_at")
          .eq("is_resolved", false)
          .order("created_at", { ascending: true })
          .limit(1),
        this.getSiteNameMap()
      ]);

    if (approvedClaimsError) throw approvedClaimsError;
    if (billingAlertsError) throw billingAlertsError;

    const claimSiteById = new Map(
      (approvedClaims ?? []).map((claim) => [
        String(claim.claim_id),
        claim.site_id ? siteNames.get(String(claim.site_id)) ?? String(claim.site_id) : "Not linked"
      ])
    );
    const approvedClaimIds = Array.from(claimSiteById.keys());
    const { data: lineItems, error: lineItemsError } = approvedClaimIds.length
      ? await db
          .from("expense_line_items")
          .select("claim_id,amount,expense_tag,client_invoice_number")
          .in("claim_id", approvedClaimIds)
          .in("expense_tag", ["AlreadyBilled", "PendingBilling"])
          .eq("is_deleted", false)
          .limit(2_000)
      : { data: [], error: null };

    if (lineItemsError) throw lineItemsError;

    let totalBillableApproved = 0;
    let totalBilled = 0;
    const matrix = new Map<string, { totalBillable: number; totalBilled: number }>();

    for (const line of lineItems ?? []) {
      const siteName = claimSiteById.get(String(line.claim_id)) ?? "Not linked";
      const current = matrix.get(siteName) ?? { totalBillable: 0, totalBilled: 0 };
      const amount = Number(line.amount);

      totalBillableApproved += amount;
      current.totalBillable += amount;

      if (line.expense_tag === "AlreadyBilled" && line.client_invoice_number) {
        totalBilled += amount;
        current.totalBilled += amount;
      }

      matrix.set(siteName, current);
    }

    const oldestBillingAlert = billingAlerts?.[0]?.created_at ? String(billingAlerts[0].created_at) : null;
    const oldestBillingAlertDays = oldestBillingAlert
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestBillingAlert).getTime()) / 86_400_000))
      : null;

    return {
      totalBillableApproved,
      totalBilled,
      unbilledLeakage: Math.max(0, totalBillableApproved - totalBilled),
      billingRecoveryPct: totalBillableApproved > 0 ? Math.round((totalBilled / totalBillableApproved) * 100) : null,
      oldestBillingAlertDays,
      recoveryMatrix: Array.from(matrix.entries())
        .map(([siteName, values]) => ({
          siteName,
          totalBillable: values.totalBillable,
          totalBilled: values.totalBilled,
          recoveryPct: values.totalBillable > 0 ? Math.round((values.totalBilled / values.totalBillable) * 100) : null
        }))
        .sort((a, b) => b.totalBillable - a.totalBillable)
    };
  }

  async listImprestLedgerReport(): Promise<ImprestLedgerReportRow[]> {
    const db = await getSupabaseAdminClient();
    const [{ data, error }, siteNames, employees] = await Promise.all([
      db
        .from("expense_claims")
        .select("ticket_id,submitter_employee_id,site_id,advance_amount,settled_amount,advance_balance,status,updated_at")
        .eq("claim_kind", "Advance")
        .eq("is_deleted", false)
        .order("updated_at", { ascending: false })
        .limit(2_000),
      this.getSiteNameMap(),
      this.listEmployees()
    ]);

    if (error) throw error;

    const employeeNames = new Map(employees.map((employee) => [employee.employeeId, employee.fullName]));
    return (data ?? []).map((row) => {
      const siteId = row.site_id ? String(row.site_id) : null;
      const employeeId = String(row.submitter_employee_id);
      return {
        ticketId: String(row.ticket_id),
        claimantName: employeeNames.get(employeeId) ?? employeeId,
        siteName: siteId ? siteNames.get(siteId) ?? siteId : null,
        advanceAmount: Number(row.advance_amount ?? 0),
        settledAmount: Number(row.settled_amount ?? 0),
        advanceBalance: Number(row.advance_balance ?? 0),
        status: row.status as ImprestLedgerReportRow["status"],
        paidAt: row.status === "PaymentReleased" ? String(row.updated_at) : null
      };
    });
  }

  async listBillableClaimReport(): Promise<BillableClaimReportRow[]> {
    const db = await getSupabaseAdminClient();
    const [{ data: claims, error: claimsError }, siteNames, employees] = await Promise.all([
      db
        .from("expense_claims")
        .select("claim_id,ticket_id,submitter_employee_id,site_id")
        .in("status", ["HodApproved", "MdApproved", "FinanceConfirmed", "PaymentReleased"])
        .eq("is_deleted", false)
        .order("updated_at", { ascending: false })
        .limit(1_000),
      this.getSiteNameMap(),
      this.listEmployees()
    ]);

    if (claimsError) throw claimsError;

    const claimIds = (claims ?? []).map((claim) => String(claim.claim_id));
    const { data: lines, error: linesError } = claimIds.length
      ? await db
          .from("expense_line_items")
          .select("claim_id,expense_head,description,amount,billable_amount,expense_tag,client_invoice_number,transaction_date")
          .in("claim_id", claimIds)
          .eq("is_deleted", false)
          .limit(5_000)
      : { data: [], error: null };

    if (linesError) throw linesError;

    const employeeNames = new Map(employees.map((employee) => [employee.employeeId, employee.fullName]));
    const claimsById = new Map(
      (claims ?? []).map((claim) => [
        String(claim.claim_id),
        {
          ticketId: String(claim.ticket_id),
          employeeId: String(claim.submitter_employee_id),
          siteId: claim.site_id ? String(claim.site_id) : null
        }
      ])
    );

    return (lines ?? []).map((line) => {
      const claim = claimsById.get(String(line.claim_id));
      const siteName = claim?.siteId ? siteNames.get(claim.siteId) ?? claim.siteId : null;
      const expenseTag = line.expense_tag as BillableClaimReportRow["expenseTag"];
      const invoiceNumber = line.client_invoice_number ? String(line.client_invoice_number) : null;
      return {
        ticketId: claim?.ticketId ?? String(line.claim_id),
        claimantName: claim ? employeeNames.get(claim.employeeId) ?? claim.employeeId : "Unknown",
        siteName,
        expenseHead: line.expense_head ? String(line.expense_head) : null,
        description: String(line.description),
        amount: Number(line.amount ?? 0),
        billableAmount: Number(line.billable_amount ?? (expenseTag === "PendingBilling" || expenseTag === "AlreadyBilled" ? line.amount : 0)),
        expenseTag,
        invoiceNumber,
        recoveryStatus:
          expenseTag === "AlreadyBilled" && invoiceNumber
            ? "Billed"
            : expenseTag === "PendingBilling"
              ? "Pending Billing"
              : "Non Billable",
        transactionDate: String(line.transaction_date)
      };
    });
  }

  private async getSiteNameMap() {
    const sites = await this.listActiveSites();
    return new Map(sites.map((site) => [site.siteId, site.siteName]));
  }

  private async getQueueLineStats(claimIds: string[]) {
    const uniqueClaimIds = [...new Set(claimIds)].filter(Boolean);
    const stats = new Map<
      string,
      { lineItemCount: number; missingReceiptCount: number; pendingBillingItemCount: number }
    >();
    if (uniqueClaimIds.length === 0) {
      return stats;
    }

    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_line_items")
      .select("claim_id,expense_tag,missing_receipt_flag")
      .in("claim_id", uniqueClaimIds)
      .eq("is_deleted", false);

    if (error) throw error;

    for (const line of data ?? []) {
      const claimId = String(line.claim_id);
      const current = stats.get(claimId) ?? {
        lineItemCount: 0,
        missingReceiptCount: 0,
        pendingBillingItemCount: 0
      };
      current.lineItemCount += 1;
      if (line.missing_receipt_flag) {
        current.missingReceiptCount += 1;
      }
      if (line.expense_tag === "PendingBilling") {
        current.pendingBillingItemCount += 1;
      }
      stats.set(claimId, current);
    }

    return stats;
  }

  private toApprovalQueueItem(claim: ClaimDetail, siteNames: Map<string, string>): ApprovalQueueItem {
    const submittedAt = claim.updatedAt ?? claim.createdAt;
    const daysPending = Math.max(
      0,
      Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000)
    );

    return {
      claimId: claim.claimId,
      submittedBy: claim.submitterEmployeeId,
      submittedByRole: "Claimant",
      siteName: claim.siteId ? siteNames.get(claim.siteId) ?? claim.siteId : null,
      totalAmount: claim.totalAmount,
      lineItemCount: claim.lineItems.length,
      missingReceiptCount: claim.lineItems.filter((item) => item.missingReceiptFlag).length,
      submittedAt,
      daysPending,
      urgencyLevel: daysPending > 5 ? "Overdue" : daysPending >= 3 ? "Attention" : "Normal"
    };
  }

  private findFlaggedLineItems(ruleName: FraudFlag["ruleName"], claims: ClaimDetail[]) {
    const lines = claims.flatMap((claim) =>
      claim.lineItems.map((line) => ({
        claimId: claim.claimId,
        lineItemId: line.lineItemId,
        description: line.description,
        amount: line.amount,
        transactionDate: line.transactionDate,
        expenseTag: line.expenseTag,
        clientInvoiceNumber: line.clientInvoiceNumber,
        missingReceiptFlag: line.missingReceiptFlag
      }))
    );

    if (ruleName === "WeekendOutlier") {
      return lines.filter((line) => line.expenseTag === "BackendCTC");
    }

    if (ruleName === "DuplicateVoucher") {
      const groups = new Map<string, typeof lines>();
      for (const line of lines) {
        const key = `${line.transactionDate}|${line.amount.toFixed(2)}`;
        groups.set(key, [...(groups.get(key) ?? []), line]);
      }

      return [...groups.values()].find((group) => group.length > 1) ?? lines;
    }

    return lines;
  }
}

export function assertClaimExists<T>(claim: T | null): T {
  if (!claim) {
    throw notFound("Claim was not found.");
  }
  return claim;
}
