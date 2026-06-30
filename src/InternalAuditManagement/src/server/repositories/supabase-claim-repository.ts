import { randomUUID } from "node:crypto";
import { notFound } from "../errors/application-error";
import type {
  ApprovalStep,
  ApprovalQueueItem,
  AuditLogEntry,
  AuditQueueItem,
  AuditImprestRegisterItem,
  BillableClaimReportRow,
  BillingAlert,
  BillingAlertQueueItem,
  ClaimDetail,
  CompanyExpenseReportRow,
  ClaimStatus,
  ClientContract,
  Employee,
  FinanceQueueItem,
  ExpenseAttachment,
  ExpenseClaim,
  ExpenseHead,
  ExpenseLineItem,
  FraudFlag,
  FraudFlagQueueItem,
  FraudFlagStatus,
  Holiday,
  ImprestLedgerReportRow,
  MisDashboardMetrics,
  NotificationOutboxInput,
  NotificationOutboxItem,
  OverviewMetrics,
  PendingAdvanceItem,
  Site
} from "../domain/types";
import { statusLabel } from "../domain/types";
import type {
  AuditLogInput,
  ClaimRepository,
  CleanupResult,
  CreateAttachmentRecord,
  CreateBillingAlertRecord,
  CreateFraudFlagRecord,
  CreateClaimRecord
} from "./claim-repository";
import { defaultClaimRecord } from "./claim-repository";
import type { CreateLineItemInput } from "../validation/claim.schemas";
import type { ChangePasswordInput, CreateContractInput, CreateEmployeeInput, CreateExpenseHeadInput, CreateHolidayInput, CreateSiteInput, ResetEmployeePasswordInput, UpdateBankDetailsInput, UpdateExpenseHeadInput, UpdateSiteInput } from "../validation/claim.schemas";
import { getSupabaseAdminClient } from "./supabase-client";
import { hashPassword, verifyPassword } from "../auth/password";
import { calculateSelectedSettlementAmounts } from "@/shared/settlement";

type ClaimRow = {
  claim_id: string;
  ticket_id: string | null;
  submitter_employee_id: string;
  company: string | null;
  claim_kind: string | null;
  submission_mode: string;
  proforma_period_start: string | null;
  proforma_period_end: string | null;
  claim_period_month: string | null;
  advance_claim_id: string | null;
  advance_amount: number | null;
  settled_amount: number | null;
  advance_balance: number | null;
  advance_adjustment_amount: number | null;
  final_payable_amount: number | null;
  net_advance_left_amount: number | null;
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
    company: (row.company ?? "Nimbus") as ExpenseClaim["company"],
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
    advanceAdjustmentAmount: Number(row.advance_adjustment_amount ?? 0),
    finalPayableAmount: Number(row.final_payable_amount ?? 0),
    netAdvanceLeftAmount: Number(row.net_advance_left_amount ?? 0),
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
    financeReviewStatus: (row.finance_review_status ?? "Pending") as ExpenseLineItem["financeReviewStatus"],
    financeReviewRemarks: row.finance_review_remarks ? String(row.finance_review_remarks) : null,
    auditReviewStatus: (row.audit_review_status ?? "Pending") as ExpenseLineItem["auditReviewStatus"],
    auditApprovedAmount: row.audit_approved_amount === null || row.audit_approved_amount === undefined ? null : Number(row.audit_approved_amount),
    auditReviewRemarks: row.audit_review_remarks ? String(row.audit_review_remarks) : null,
    auditReviewedBy: row.audit_reviewed_by ? String(row.audit_reviewed_by) : null,
    auditReviewedAt: row.audit_reviewed_at ? String(row.audit_reviewed_at) : null,
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
    passwordResetRequired: Boolean(row.password_reset_required),
    passwordUpdatedAt: row.password_updated_at ? String(row.password_updated_at) : null,
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

function mapExpenseHead(row: Record<string, unknown>): ExpenseHead {
  return {
    expenseHeadId: String(row.expense_head_id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapNotification(row: Record<string, unknown>): NotificationOutboxItem {
  return {
    notificationId: String(row.notification_id),
    recipientEmployeeId: String(row.recipient_employee_id),
    recipientEmail: String(row.recipient_email),
    subject: String(row.subject),
    body: String(row.body),
    relatedClaimId: row.related_claim_id ? String(row.related_claim_id) : null,
    status: row.status as NotificationOutboxItem["status"],
    deliveryAttempts: Number(row.delivery_attempts ?? 0),
    lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
    createdAt: String(row.created_at),
    sentAt: row.sent_at ? String(row.sent_at) : null
  };
}

function mapAuditLog(row: Record<string, unknown>, actorNames: Map<string, string>): AuditLogEntry {
  const actorUserId = String(row.actor_user_id);
  return {
    auditId: String(row.log_id),
    claimId: String(row.claim_id),
    actorUserId,
    actorName: actorNames.get(actorUserId) ?? null,
    actionType: row.action_type as AuditLogEntry["actionType"],
    preActionStatus: row.pre_action_status ? String(row.pre_action_status) : null,
    postActionStatus: String(row.post_action_status),
    auditRemarks: row.audit_remarks ? String(row.audit_remarks) : null,
    correlationId: String(row.correlation_id),
    actionTimestamp: String(row.action_timestamp)
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

function auditPendingLocation(claim: ClaimDetail) {
  if (claim.status === "Draft") return "With claimant for drafting";
  if (claim.status === "Rejected") return "With claimant for correction";
  if (claim.status === "PaymentReleased") return "Payment released";

  const pendingStep = claim.approvalSteps
    .filter((step) => step.decision === "Pending")
    .sort((a, b) => a.stepOrder - b.stepOrder)[0];
  if (pendingStep) return `Pending with ${approverRoleLabel(pendingStep.requiredApproverRole)}`;

  if (claim.status === "AuditPending") return "Pending with Auditor";
  if (claim.status === "FinanceConfirmed") return "Pending payment release by Finance";
  if (claim.status === "HodApproved" || claim.status === "MdApproved") return "Pending with Finance";
  if (claim.status === "Submitted") return "Pending operational approval";
  return "Status updated";
}

function approverRoleLabel(role: string) {
  const labels: Record<string, string> = {
    ClusterHead: "Cluster Head",
    HOD: "HOD",
    MD: "Managing Director",
    Finance: "Finance",
    Auditor: "Auditor"
  };
  return labels[role] ?? role;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeVendorName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeEmailForLookup(value: string) {
  return value.trim().toLowerCase();
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

function mapSiteRow(row: Record<string, unknown>): Site {
  const contract = Array.isArray(row.client_contracts) ? row.client_contracts[0] : row.client_contracts;
  return {
    siteId: String(row.site_id),
    siteName: String(row.site_name),
    siteAddress: row.site_address ? String(row.site_address) : null,
    serviceType: row.service_type as Site["serviceType"],
    contractId: row.contract_id ? String(row.contract_id) : null,
    clientName: contract && typeof contract === "object" && "client_name" in contract && contract.client_name ? String(contract.client_name) : null,
    contractDescription: contract && typeof contract === "object" && "description" in contract && contract.description ? String(contract.description) : null,
    clusterHeadEmployeeId: row.cluster_head_employee_id ? String(row.cluster_head_employee_id) : null,
    clusterHeadName: null,
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

  async listSites(includeInactive = false): Promise<Site[]> {
    if (!includeInactive) return this.listActiveSites();
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("sites")
      .select("site_id, site_name, site_address, service_type, contract_id, cluster_head_employee_id, is_active, client_contracts(client_name, description)")
      .order("site_name");

    if (error) throw error;

    return (data ?? []).map(mapSiteRow);
  }

  private async fetchActiveSites(): Promise<Site[]> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("sites")
      .select("site_id, site_name, site_address, service_type, contract_id, cluster_head_employee_id, is_active, client_contracts(client_name, description)")
      .eq("is_active", true)
      .order("site_name");

    if (error) throw error;

    return (data ?? []).map(mapSiteRow);
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
      clusterHeadName: null,
      isActive: true
    };
  }

  async updateSite(siteId: string, input: UpdateSiteInput): Promise<Site> {
    const db = await getSupabaseAdminClient();
    const { error } = await db
      .from("sites")
      .update({
        site_name: input.siteName,
        site_address: input.siteAddress ?? null,
        service_type: input.serviceType,
        contract_id: input.contractId,
        cluster_head_employee_id: input.clusterHeadEmployeeId,
        is_active: input.isActive
      })
      .eq("site_id", siteId);

    if (error) throw error;
    this.activeSitesPromise = null;
    const sites = await this.listSites(true);
    return sites.find((site) => site.siteId === siteId) ?? {
      siteId,
      siteName: input.siteName,
      siteAddress: input.siteAddress ?? null,
      serviceType: input.serviceType,
      contractId: input.contractId,
      clientName: null,
      contractDescription: null,
      clusterHeadEmployeeId: input.clusterHeadEmployeeId,
      clusterHeadName: null,
      isActive: input.isActive
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
      clusterHeadName: null,
      isActive: false
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

  async listExpenseHeads(includeInactive = false): Promise<ExpenseHead[]> {
    const db = await getSupabaseAdminClient();
    let query = db.from("expense_heads").select("*").order("name", { ascending: true });
    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapExpenseHead);
  }

  async createExpenseHead(input: CreateExpenseHeadInput): Promise<ExpenseHead> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_heads")
      .insert({
        name: input.name,
        description: input.description ?? null,
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .select("*")
      .single();

    if (error) throw error;
    return mapExpenseHead(data);
  }

  async updateExpenseHead(expenseHeadId: string, input: UpdateExpenseHeadInput): Promise<ExpenseHead> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_heads")
      .update({
        name: input.name,
        description: input.description ?? null,
        is_active: input.isActive,
        updated_at: new Date().toISOString()
      })
      .eq("expense_head_id", expenseHeadId)
      .select("*")
      .single();

    if (error) throw error;
    return mapExpenseHead(data);
  }

  async deactivateExpenseHead(expenseHeadId: string): Promise<ExpenseHead> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_heads")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("expense_head_id", expenseHeadId)
      .select("*")
      .single();

    if (error) throw error;
    return mapExpenseHead(data);
  }

  async resetEmployeePassword(employeeId: string, input: ResetEmployeePasswordInput): Promise<Employee> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("employees")
      .update({
        password_hash: await hashPassword(input.temporaryPassword),
        password_reset_required: input.requirePasswordReset,
        password_updated_at: new Date().toISOString()
      })
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .select("*")
      .single();

    if (error) throw error;
    return mapEmployee(data);
  }

  async changeEmployeePassword(employeeId: string, input: ChangePasswordInput): Promise<Employee | null> {
    const db = await getSupabaseAdminClient();
    const { data: employee, error: employeeError } = await db
      .from("employees")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .maybeSingle();

    if (employeeError) throw employeeError;
    if (!employee) return null;

    const storedHash = employee.password_hash ? String(employee.password_hash) : null;
    const isCurrentPasswordValid =
      (await verifyPassword(input.currentPassword, storedHash)) ||
      (!storedHash && isBootstrapLogin(String(employee.email), input.currentPassword));

    if (!isCurrentPasswordValid) {
      return null;
    }

    const { data, error } = await db
      .from("employees")
      .update({
        password_hash: await hashPassword(input.newPassword),
        password_reset_required: false,
        password_updated_at: new Date().toISOString()
      })
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .select("*")
      .single();

    if (error) throw error;
    return mapEmployee(data);
  }

  async listClaimsForUser(userId: string, role: string): Promise<ExpenseClaim[]> {
    const db = await getSupabaseAdminClient();
    let query = db.from("expense_claims").select("*").eq("is_deleted", false).order("created_at", {
      ascending: false
    });

    if (role === "Claimant" || role === "ClusterHead" || role === "HOD") {
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
          lineItemId: step.line_item_id ? String(step.line_item_id) : null,
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
    claim.ticketId = await this.nextTicketId(input.claimKind ?? "Reimbursement");
    const { data, error } = await db
      .from("expense_claims")
      .insert({
        claim_id: claim.claimId,
        ticket_id: claim.ticketId,
        submitter_employee_id: claim.submitterEmployeeId,
        company: claim.company,
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
        advance_adjustment_amount: claim.advanceAdjustmentAmount,
        final_payable_amount: claim.finalPayableAmount,
        net_advance_left_amount: claim.netAdvanceLeftAmount,
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
        client_invoice_number: input.expenseTag === "AlreadyBilled" ? input.clientInvoiceNumber?.trim() || null : null,
        vendor_name: input.vendorName ?? null,
        vendor_invoice_number: input.vendorInvoiceNumber?.trim() || null,
        billable_amount: input.expenseTag === "PendingBilling" ? input.billableAmount ?? input.amount : input.billableAmount ?? null,
        site_or_department: input.siteOrDepartment ?? null,
        line_ticket_id: input.lineTicketId ?? null,
        invoice_validation_status: input.expenseTag === "AlreadyBilled" && input.clientInvoiceNumber ? "PendingErpValidation" : "NotApplicable",
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
        client_invoice_number: input.expenseTag === "AlreadyBilled" ? input.clientInvoiceNumber?.trim() || null : null,
        vendor_name: input.vendorName ?? null,
        vendor_invoice_number: input.vendorInvoiceNumber?.trim() || null,
        billable_amount: input.expenseTag === "PendingBilling" ? input.billableAmount ?? input.amount : input.billableAmount ?? null,
        site_or_department: input.siteOrDepartment ?? null,
        line_ticket_id: input.lineTicketId ?? null,
        invoice_validation_status: input.expenseTag === "AlreadyBilled" && input.clientInvoiceNumber ? "PendingErpValidation" : "NotApplicable",
        site_id: input.expenseTag === "ContractPartCost" ? input.siteId ?? null : null,
        audit_review_status: "Pending",
        audit_approved_amount: null,
        audit_review_remarks: null,
        audit_reviewed_by: null,
        audit_reviewed_at: null,
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

  async reviewLineItem(
    claimId: string,
    lineItemId: string,
    decision: "Accepted" | "Rejected",
    remarks?: string | null
  ): Promise<ExpenseLineItem> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_line_items")
      .update({
        finance_review_status: decision,
        finance_review_remarks: remarks ?? null
      })
      .eq("claim_id", claimId)
      .eq("line_item_id", lineItemId)
      .eq("is_deleted", false)
      .select("*")
      .single();

    if (error) throw error;
    return mapLineItem(data);
  }

  async reviewAuditLineItem(
    claimId: string,
    lineItemId: string,
    input: {
      decision: "Approved" | "Rejected";
      approvedAmount: number | null;
      remarks?: string | null;
      reviewedByUserId: string;
    }
  ): Promise<ExpenseLineItem> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_line_items")
      .update({
        audit_review_status: input.decision,
        audit_approved_amount: input.decision === "Approved" ? input.approvedAmount : null,
        audit_review_remarks: input.remarks ?? null,
        audit_reviewed_by: input.reviewedByUserId,
        audit_reviewed_at: new Date().toISOString()
      })
      .eq("claim_id", claimId)
      .eq("line_item_id", lineItemId)
      .eq("is_deleted", false)
      .select("*")
      .single();

    if (error) throw error;
    return mapLineItem(data);
  }

  async invoiceReferenceExists(
    invoiceNumber: string,
    options: {
      referenceType?: "Client" | "Vendor";
      vendorName?: string | null;
      excludingLineItemId?: string;
    } = {}
  ): Promise<boolean> {
    const db = await getSupabaseAdminClient();
    const referenceType = options.referenceType ?? "Client";
    let query = db
      .from("expense_line_items")
      .select("line_item_id,vendor_name")
      .eq(referenceType === "Vendor" ? "vendor_invoice_number" : "client_invoice_number", invoiceNumber)
      .eq("is_deleted", false)
      .limit(referenceType === "Vendor" ? 100 : 1);

    if (options.excludingLineItemId) {
      query = query.neq("line_item_id", options.excludingLineItemId);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (referenceType === "Vendor") {
      const vendorName = normalizeVendorName(options.vendorName);
      return (data ?? []).some((row) => normalizeVendorName(row.vendor_name ? String(row.vendor_name) : null) === vendorName);
    }
    return (data ?? []).length > 0;
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
      .select("claim_kind,settled_amount,advance_claim_id,advance_adjustment_amount")
      .eq("claim_id", claimId)
      .single();

    if (claimError) throw claimError;

    const isAdvance = claim?.claim_kind === "Advance";
    const hasAdvanceAdjustment = Boolean(claim?.advance_claim_id);
    const settledAmount = Number(claim?.settled_amount ?? 0);
    let openAdvanceBalance = 0;

    if (hasAdvanceAdjustment && claim.advance_claim_id) {
      const { data: advance, error: advanceError } = await db
        .from("expense_claims")
        .select("advance_balance")
        .eq("claim_id", claim.advance_claim_id)
        .eq("claim_kind", "Advance")
        .single();

      if (advanceError) throw advanceError;
      openAdvanceBalance = Number(advance.advance_balance ?? 0);
    }

    const requestedAdjustment = hasAdvanceAdjustment ? Number(claim?.advance_adjustment_amount ?? 0) : 0;
    const settlementAmounts = calculateSelectedSettlementAmounts(total, openAdvanceBalance, requestedAdjustment);
    const { error: updateError } = await db
      .from("expense_claims")
      .update({
        total_amount: total,
        advance_adjustment_amount: settlementAmounts.advanceAdjusted,
        final_payable_amount: settlementAmounts.finalPayable,
        net_advance_left_amount: settlementAmounts.netAdvanceLeft,
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

  async assignSiteClusterHead(siteId: string, clusterHeadEmployeeId: string): Promise<Site> {
    const db = await getSupabaseAdminClient();
    const { error } = await db
      .from("sites")
      .update({ cluster_head_employee_id: clusterHeadEmployeeId })
      .eq("site_id", siteId)
      .eq("is_active", true);
    if (error) throw error;
    this.activeSitesPromise = null;
    const site = (await this.listActiveSites()).find((item) => item.siteId === siteId);
    if (!site) throw new Error("Site was not found.");
    return site;
  }

  async updateSettlementAdjustment(
    claimId: string,
    advanceClaimId: string,
    totalAmount: number,
    openAdvanceBalance: number,
    adjustmentAmount: number
  ): Promise<ExpenseClaim> {
    const amounts = calculateSelectedSettlementAmounts(totalAmount, openAdvanceBalance, adjustmentAmount);
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_claims")
      .update({
        advance_claim_id: advanceClaimId,
        advance_adjustment_amount: amounts.advanceAdjusted,
        final_payable_amount: amounts.finalPayable,
        net_advance_left_amount: amounts.netAdvanceLeft,
        updated_at: new Date().toISOString()
      })
      .eq("claim_id", claimId)
      .select("*")
      .single();

    if (error) throw error;
    return mapClaim(data as ClaimRow);
  }

  async createApprovalSteps(
    steps: Omit<ApprovalStep, "stepId" | "decision" | "decisionAt" | "remarks">[]
  ): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { error } = await db.from("approval_steps").insert(
      steps.map((step) => ({
        step_id: randomUUID(),
        claim_id: step.claimId,
        line_item_id: step.lineItemId ?? null,
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

  async updateEmployeeBankDetails(employeeId: string, input: UpdateBankDetailsInput): Promise<Employee> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("employees")
      .update({
        bank_account_holder_name: input.bankAccountHolderName,
        bank_account_number: input.bankAccountNumber,
        bank_ifsc: input.bankIfsc.toUpperCase(),
        bank_name: input.bankName
      })
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .select("*")
      .single();

    if (error) throw error;
    return mapEmployee(data);
  }

  async getEmployeeByEmail(email: string): Promise<Employee | null> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("employees")
      .select("*")
      .ilike("email", normalizeEmailForLookup(email))
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
      .ilike("email", normalizeEmailForLookup(email))
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

  async enqueueNotification(input: NotificationOutboxInput): Promise<NotificationOutboxItem> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("notification_outbox")
      .insert({
        notification_id: randomUUID(),
        recipient_employee_id: input.recipientEmployeeId,
        recipient_email: input.recipientEmail,
        subject: input.subject,
        body: input.body,
        related_claim_id: input.relatedClaimId,
        status: "Queued"
      })
      .select("*")
      .single();

    if (error) throw error;
    return mapNotification(data);
  }

  async listNotifications(status = "Queued" as NotificationOutboxItem["status"] | "All"): Promise<NotificationOutboxItem[]> {
    const db = await getSupabaseAdminClient();
    let query = db
      .from("notification_outbox")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (status !== "All") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapNotification);
  }

  async markNotificationSent(notificationId: string, providerMessageId: string | null): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { data: current, error: readError } = await db
      .from("notification_outbox")
      .select("delivery_attempts")
      .eq("notification_id", notificationId)
      .single();
    if (readError) throw readError;

    const { error } = await db
      .from("notification_outbox")
      .update({
        status: "Sent",
        delivery_attempts: Number(current?.delivery_attempts ?? 0) + 1,
        last_attempt_at: new Date().toISOString(),
        last_error: null,
        provider_message_id: providerMessageId,
        sent_at: new Date().toISOString()
      })
      .eq("notification_id", notificationId);

    if (error) throw error;
  }

  async listAuditLogForClaim(claimId: string): Promise<AuditLogEntry[]> {
    const db = await getSupabaseAdminClient();
    const [{ data, error }, employees] = await Promise.all([
      db
        .from("audit_log")
        .select("*")
        .eq("claim_id", claimId)
        .order("action_timestamp", { ascending: true }),
      this.listEmployees()
    ]);

    if (error) throw error;

    const actorNames = new Map(employees.map((employee) => [employee.employeeId, employee.fullName]));
    return (data ?? []).map((row) => mapAuditLog(row, actorNames));
  }

  async markNotificationFailed(notificationId: string, errorMessage: string): Promise<void> {
    const db = await getSupabaseAdminClient();
    const { data: current, error: readError } = await db
      .from("notification_outbox")
      .select("delivery_attempts")
      .eq("notification_id", notificationId)
      .single();
    if (readError) throw readError;

    const { error } = await db
      .from("notification_outbox")
      .update({
        status: "Failed",
        delivery_attempts: Number(current?.delivery_attempts ?? 0) + 1,
        last_attempt_at: new Date().toISOString(),
        last_error: errorMessage.slice(0, 1000)
      })
      .eq("notification_id", notificationId);

    if (error) throw error;
  }

  async cleanupStaleRecords(cutoffIso: string): Promise<CleanupResult> {
    const db = await getSupabaseAdminClient();
    const [{ data: drafts, error: draftError }, { data: notifications, error: notificationError }] = await Promise.all([
      db
        .from("expense_claims")
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq("status", "Draft")
        .eq("is_deleted", false)
        .lt("updated_at", cutoffIso)
        .select("claim_id"),
      db
        .from("notification_outbox")
        .delete()
        .eq("status", "Failed")
        .gte("delivery_attempts", 3)
        .lt("created_at", cutoffIso)
        .select("notification_id")
    ]);

    if (draftError) throw draftError;
    if (notificationError) throw notificationError;
    return {
      staleDraftsRemoved: drafts?.length ?? 0,
      exhaustedNotificationsRemoved: notifications?.length ?? 0
    };
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
    const [{ data, error }, siteNames, employees] = await Promise.all([
      db
        .from("expense_claims")
        .select("claim_id,ticket_id,company,claim_kind,status,advance_claim_id,submitter_employee_id,total_amount,advance_adjustment_amount,final_payable_amount,net_advance_left_amount,site_id,physical_receipt_confirmed_at,created_at,updated_at")
        .in("status", ["HodApproved", "MdApproved", "FinanceConfirmed"])
        .eq("is_deleted", false)
        .order("updated_at", { ascending: false })
        .limit(50),
      this.getSiteNameMap(),
      this.listEmployees()
    ]);

    if (error) throw error;
    const claims = data ?? [];
    const lineStats = await this.getQueueLineStats(claims.map((row) => String(row.claim_id)));
    const employeesById = new Map(employees.map((employee) => [employee.employeeId, employee]));
    const advanceClaimIds = claims
      .filter((claim) => claim.advance_claim_id)
      .map((claim) => String(claim.advance_claim_id));
    const { data: advances, error: advancesError } = advanceClaimIds.length
      ? await db.from("expense_claims").select("claim_id,advance_balance").in("claim_id", advanceClaimIds)
      : { data: [], error: null };

    if (advancesError) throw advancesError;
    const advanceBalances = new Map(
      (advances ?? []).map((advance) => [String(advance.claim_id), Number(advance.advance_balance ?? 0)])
    );

    const items: FinanceQueueItem[] = claims.map((claim) => {
      const claimId = String(claim.claim_id);
      const submitter = employeesById.get(String(claim.submitter_employee_id));
      const stats = lineStats.get(claimId) ?? {
        lineItemCount: 0,
        missingReceiptCount: 0,
        pendingBillingItemCount: 0
      };
      const submittedAt = String(claim.updated_at ?? claim.created_at);
      const daysPending = Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000));
      const siteId = claim.site_id ? String(claim.site_id) : null;
      const currentSettlementAmounts =
        claim.advance_claim_id
          ? calculateSelectedSettlementAmounts(
              Number(claim.total_amount),
              advanceBalances.get(String(claim.advance_claim_id)) ?? 0,
              Number(claim.advance_adjustment_amount ?? 0)
            )
          : null;
      return {
        claimId,
        ticketId: claim.ticket_id ? String(claim.ticket_id) : `EXP-${claimId.slice(0, 8).toUpperCase()}`,
        company: (claim.company ?? "Nimbus") as FinanceQueueItem["company"],
        claimKind: (claim.claim_kind ?? "Reimbursement") as FinanceQueueItem["claimKind"],
        status: String(claim.status) as FinanceQueueItem["status"],
        submittedBy: String(claim.submitter_employee_id),
        submittedByRole: "Claimant" as const,
        siteName: siteId ? siteNames.get(siteId) ?? siteId : null,
        totalAmount: Number(claim.total_amount),
        advanceAdjustmentAmount: currentSettlementAmounts?.advanceAdjusted ?? Number(claim.advance_adjustment_amount ?? 0),
        finalPayableAmount: currentSettlementAmounts?.finalPayable ?? Number(claim.final_payable_amount ?? claim.total_amount),
        netAdvanceLeftAmount: currentSettlementAmounts?.netAdvanceLeft ?? Number(claim.net_advance_left_amount ?? 0),
        lineItemCount: stats.lineItemCount,
        missingReceiptCount: stats.missingReceiptCount,
        submittedAt,
        daysPending,
        urgencyLevel: daysPending > 5 ? "Overdue" as const : daysPending >= 3 ? "Attention" as const : "Normal" as const,
        physicalReceiptRequired: claim.claim_kind !== "Advance",
        physicalReceiptConfirmed: claim.claim_kind === "Advance" || Boolean(claim.physical_receipt_confirmed_at),
        hasPendingBillingItems: stats.pendingBillingItemCount > 0,
        pendingBillingItemCount: stats.pendingBillingItemCount,
        bankAccountHolderName: submitter?.bankAccountHolderName ?? null,
        bankAccountNumber: submitter?.bankAccountNumber ?? null,
        bankIfsc: submitter?.bankIfsc ?? null,
        bankName: submitter?.bankName ?? null
      };
    });

    return items;
  }

  async listAuditQueue(): Promise<AuditQueueItem[]> {
    const db = await getSupabaseAdminClient();
    const [{ data, error }, siteNames, employees] = await Promise.all([
      db
        .from("expense_claims")
        .select("claim_id,ticket_id,company,claim_kind,status,advance_claim_id,submitter_employee_id,total_amount,advance_adjustment_amount,final_payable_amount,net_advance_left_amount,site_id,physical_receipt_confirmed_at,created_at,updated_at")
        .eq("status", "AuditPending")
        .eq("is_deleted", false)
        .order("updated_at", { ascending: false })
        .limit(50),
      this.getSiteNameMap(),
      this.listEmployees()
    ]);

    if (error) throw error;
    const claims = data ?? [];
    const claimIds = claims.map((claim) => String(claim.claim_id));
    const { data: voucherReceiptLogs, error: voucherReceiptLogsError } = claimIds.length
      ? await db
          .from("audit_log")
          .select("claim_id,action_timestamp")
          .in("claim_id", claimIds)
          .eq("action_type", "AUDITOR_VOUCHERS_RECEIVED")
          .order("action_timestamp", { ascending: true })
      : { data: [], error: null };
    if (voucherReceiptLogsError) throw voucherReceiptLogsError;
    const auditorVoucherReceivedAtByClaim = new Map(
      (voucherReceiptLogs ?? []).map((entry) => [String(entry.claim_id), String(entry.action_timestamp)])
    );
    const lineStats = await this.getQueueLineStats(claims.map((row) => String(row.claim_id)));
    const employeesById = new Map(employees.map((employee) => [employee.employeeId, employee]));
    const advanceClaimIds = claims
      .filter((claim) => claim.advance_claim_id)
      .map((claim) => String(claim.advance_claim_id));
    const { data: advances, error: advancesError } = advanceClaimIds.length
      ? await db.from("expense_claims").select("claim_id,advance_balance").in("claim_id", advanceClaimIds)
      : { data: [], error: null };

    if (advancesError) throw advancesError;
    const advanceBalances = new Map(
      (advances ?? []).map((advance) => [String(advance.claim_id), Number(advance.advance_balance ?? 0)])
    );

    return claims.map((claim) => {
      const claimId = String(claim.claim_id);
      const submitter = employeesById.get(String(claim.submitter_employee_id));
      const stats = lineStats.get(claimId) ?? {
        lineItemCount: 0,
        missingReceiptCount: 0,
        pendingBillingItemCount: 0
      };
      const submittedAt = String(claim.updated_at ?? claim.created_at);
      const daysPending = Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000));
      const siteId = claim.site_id ? String(claim.site_id) : null;
      const currentSettlementAmounts =
        claim.advance_claim_id
          ? calculateSelectedSettlementAmounts(
              Number(claim.total_amount),
              advanceBalances.get(String(claim.advance_claim_id)) ?? 0,
              Number(claim.advance_adjustment_amount ?? 0)
            )
          : null;

      return {
        claimId,
        ticketId: claim.ticket_id ? String(claim.ticket_id) : `EXP-${claimId.slice(0, 8).toUpperCase()}`,
        company: (claim.company ?? "Nimbus") as AuditQueueItem["company"],
        claimKind: (claim.claim_kind ?? "Reimbursement") as AuditQueueItem["claimKind"],
        status: String(claim.status) as AuditQueueItem["status"],
        submittedBy: submitter?.fullName ?? String(claim.submitter_employee_id),
        submittedByRole: submitter?.role ?? "Claimant",
        siteName: siteId ? siteNames.get(siteId) ?? siteId : null,
        totalAmount: Number(claim.total_amount),
        advanceAdjustmentAmount: currentSettlementAmounts?.advanceAdjusted ?? Number(claim.advance_adjustment_amount ?? 0),
        finalPayableAmount: currentSettlementAmounts?.finalPayable ?? Number(claim.final_payable_amount ?? claim.total_amount),
        netAdvanceLeftAmount: currentSettlementAmounts?.netAdvanceLeft ?? Number(claim.net_advance_left_amount ?? 0),
        lineItemCount: stats.lineItemCount,
        missingReceiptCount: stats.missingReceiptCount,
        submittedAt,
        daysPending,
        urgencyLevel: daysPending > 5 ? "Overdue" as const : daysPending >= 3 ? "Attention" as const : "Normal" as const,
        physicalReceiptRequired: claim.claim_kind !== "Advance",
        physicalReceiptConfirmed: claim.claim_kind === "Advance" || Boolean(claim.physical_receipt_confirmed_at),
        hasPendingBillingItems: stats.pendingBillingItemCount > 0,
        pendingBillingItemCount: stats.pendingBillingItemCount,
        bankAccountHolderName: submitter?.bankAccountHolderName ?? null,
        bankAccountNumber: submitter?.bankAccountNumber ?? null,
        bankIfsc: submitter?.bankIfsc ?? null,
        bankName: submitter?.bankName ?? null,
        receiptConfirmedAt: claim.physical_receipt_confirmed_at ? String(claim.physical_receipt_confirmed_at) : null,
        auditorVoucherReceivedAt: auditorVoucherReceivedAtByClaim.get(claimId) ?? null,
        auditDecisionRequired: true
      };
    });
  }

  async listAuditImprestRegister(): Promise<AuditImprestRegisterItem[]> {
    const db = await getSupabaseAdminClient();
    const [{ data, error }, siteNames, employees] = await Promise.all([
      db
        .from("expense_claims")
        .select("claim_id,ticket_id,company,claim_kind,status,submitter_employee_id,site_id,total_amount,advance_amount,settled_amount,advance_balance,advance_adjustment_amount,final_payable_amount,updated_at")
        .eq("is_deleted", false)
        .order("updated_at", { ascending: false })
        .limit(1_000),
      this.getSiteNameMap(),
      this.listEmployees()
    ]);

    if (error) throw error;

    const employeeNames = new Map(employees.map((employee) => [employee.employeeId, employee.fullName]));
    return (data ?? []).map((row) => {
      const updatedAt = String(row.updated_at);
      const siteId = row.site_id ? String(row.site_id) : null;
      const employeeId = String(row.submitter_employee_id);
      const status = row.status as AuditImprestRegisterItem["status"];
      return {
        claimId: String(row.claim_id),
        ticketId: row.ticket_id ? String(row.ticket_id) : `${row.claim_kind === "Advance" ? "ADV" : "EXP"}-${String(row.claim_id).slice(0, 8).toUpperCase()}`,
        company: (row.company ?? "Nimbus") as AuditImprestRegisterItem["company"],
        claimKind: (row.claim_kind ?? "Reimbursement") as AuditImprestRegisterItem["claimKind"],
        status,
        statusLabel: statusLabel(status),
        submittedBy: employeeNames.get(employeeId) ?? employeeId,
        siteName: siteId ? siteNames.get(siteId) ?? siteId : null,
        totalAmount: Number(row.total_amount ?? 0),
        advanceAmount: Number(row.advance_amount ?? 0),
        settledAmount: Number(row.settled_amount ?? 0),
        advanceBalance: Number(row.advance_balance ?? 0),
        advanceAdjustmentAmount: Number(row.advance_adjustment_amount ?? 0),
        finalPayableAmount: Number(row.final_payable_amount ?? 0),
        updatedAt,
        ageDays: Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000))
      };
    });
  }

  async listPendingAdvances(userId: string, role: string): Promise<PendingAdvanceItem[]> {
    const db = await getSupabaseAdminClient();
    let query = db
      .from("expense_claims")
      .select("claim_id,ticket_id,company,submitter_employee_id,site_id,advance_amount,settled_amount,advance_balance,updated_at")
      .eq("claim_kind", "Advance")
      .eq("status", "PaymentReleased")
      .gt("advance_balance", 0)
      .eq("is_deleted", false)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (["Claimant", "ClusterHead", "HOD"].includes(role)) {
      query = query.eq("submitter_employee_id", userId);
    }

    const [{ data, error }, siteNames] = await Promise.all([query, this.getSiteNameMap()]);
    if (error) throw error;

    return (data ?? []).map((row) => {
      const paidAt = String(row.updated_at);
      const siteId = row.site_id ? String(row.site_id) : null;
      const ageDays = Math.max(0, Math.floor((Date.now() - new Date(paidAt).getTime()) / 86_400_000));
      const settlementStatus = ageDays > 30 ? "Overdue" : ageDays >= 15 ? "Aging" : "Open";
      return {
        claimId: String(row.claim_id),
        ticketId: row.ticket_id ? String(row.ticket_id) : `ADV-${String(row.claim_id).slice(0, 8).toUpperCase()}`,
        company: (row.company ?? "Nimbus") as PendingAdvanceItem["company"],
        submittedBy: String(row.submitter_employee_id),
        siteId,
        siteName: siteId ? siteNames.get(siteId) ?? siteId : null,
        advanceAmount: Number(row.advance_amount),
        settledAmount: Number(row.settled_amount),
        advanceBalance: Number(row.advance_balance),
        paidAt,
        ageDays,
        settlementStatus,
        settlementStatusLabel:
          settlementStatus === "Overdue" ? "Overdue settlement" : settlementStatus === "Aging" ? "Aging settlement" : "Open settlement"
      };
    });
  }

  async activeSettlementExists(advanceClaimId: string, excludingClaimId: string): Promise<boolean> {
    return Boolean(await this.findActiveAdvanceAdjustment(advanceClaimId, excludingClaimId));
  }

  async findActiveAdvanceAdjustment(advanceClaimId: string, excludingClaimId: string): Promise<ExpenseClaim | null> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db
      .from("expense_claims")
      .select("*")
      .eq("advance_claim_id", advanceClaimId)
      .in("status", ["Draft", "Submitted", "HodApproved", "MdApproved", "AuditPending", "FinanceConfirmed"])
      .neq("claim_id", excludingClaimId)
      .eq("is_deleted", false)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapClaim(data as ClaimRow) : null;
  }

  async releasePaymentAtomically(claimId: string, actorUserId: string, correlationId: string): Promise<ExpenseClaim> {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db.rpc("release_payment_atomically", {
      claim_id_input: claimId,
      actor_user_id_input: actorUserId,
      correlation_id_input: correlationId
    });

    if (error) throw error;
    return mapClaim(data as ClaimRow);
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
      lineItemId: data.line_item_id ? String(data.line_item_id) : null,
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

  private async nextTicketId(claimKind: ExpenseClaim["claimKind"]) {
    const db = await getSupabaseAdminClient();
    const { data, error } = await db.rpc("next_claim_ticket_id", { claim_kind_input: claimKind });
    if (error) throw error;
    return String(data);
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

    const { error: stepError } = await db
      .from("approval_steps")
      .delete()
      .eq("claim_id", claimId);

    if (stepError) throw stepError;
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
    const { data: existingSteps, error: stepsError } = await db
      .from("approval_steps")
      .select("step_order")
      .eq("claim_id", claimId);

    if (stepsError) throw stepsError;
    const nextStepOrder = Math.max(1, ...(existingSteps ?? []).map((step) => Number(step.step_order))) + 1;
    const { error } = await db.from("approval_steps").insert({
      step_id: randomUUID(),
      claim_id: claimId,
      step_order: nextStepOrder,
      required_approver_role: "Finance",
      assigned_approver_id: null,
      decision: "Pending"
    });

    if (error) throw error;
  }

  async createAuditorApprovalStep(claimId: string): Promise<void> {
    const db = await getSupabaseAdminClient();
    const auditors = (await this.listEmployees()).filter((employee) => employee.role === "Auditor");
    const assignedAuditor = auditors[0]?.employeeId ?? null;
    const { error } = await db.from("approval_steps").insert({
      step_id: randomUUID(),
      claim_id: claimId,
      step_order: 3,
      required_approver_role: "Auditor",
      assigned_approver_id: assignedAuditor,
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
            .select("line_item_id,description,amount,billable_amount")
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
          amount: Number(item.amount),
          billableAmount: Number(item.billable_amount ?? item.amount)
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
        billableAmount: lineItem?.billableAmount ?? 0,
        claimantName: claim?.submitterEmployeeId ?? "Unknown",
        siteName: claim?.siteId ? siteNames.get(claim.siteId) ?? claim.siteId : null,
        daysOpen,
        urgencyLabel:
          daysOpen >= 7 ? "Escalate to Finance" : daysOpen >= 2 ? "Needs billing follow-up" : "Within 48-hour window"
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
      .in("status", ["AuditPending", "FinanceConfirmed", "PaymentReleased"])
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
    const [claims, siteNames, employees] = await Promise.all([
      this.getClaimDetails(claimIds),
      this.getSiteNameMap(),
      this.listEmployees()
    ]);
    const claimsById = new Map(claims.map((claim) => [claim.claimId, claim]));
    const employeeNames = new Map(employees.map((employee) => [employee.employeeId, employee.fullName]));

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
        ticketId: claim?.ticketId ?? flag.primaryClaimId.slice(0, 8),
        employeeName: claim ? employeeNames.get(claim.submitterEmployeeId) ?? claim.submitterEmployeeId : "Unknown",
        claimKind: claim?.claimKind ?? "Unknown",
        submissionMode: claim?.submissionMode ?? "Unknown",
        claimStatus: claim?.status ?? "Unknown",
        statusLabel: claim ? statusLabel(claim.status) : "Unknown",
        pendingLocation: claim ? auditPendingLocation(claim) : "Claim detail unavailable",
        siteName: claim?.siteId ? siteNames.get(claim.siteId) ?? claim.siteId : null,
        totalAmount: claim?.totalAmount ?? 0,
        flaggedLineItems: this.findFlaggedLineItems(flag.ruleName, claimGroup),
        approvalTrail: (claim?.approvalSteps ?? []).map((step) => ({
          role: step.requiredApproverRole,
          decision: step.decision,
          decidedAt: step.decisionAt,
          remarks: step.remarks
        }))
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
    const financeQueue = role === "Finance" ? await this.listFinanceQueue() : [];

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
      billingRecoveryPct: totalBillable > 0 ? Math.round((totalBilled / totalBillable) * 100) : null,
      canViewBillingMetrics: false,
      canViewFraudFlags: false
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
        .select("ticket_id,company,submitter_employee_id,site_id,advance_amount,settled_amount,advance_balance,status,updated_at")
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
        company: (row.company ?? "Nimbus") as ImprestLedgerReportRow["company"],
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
        .select("claim_id,ticket_id,company,submitter_employee_id,site_id")
        .in("status", ["HodApproved", "MdApproved", "FinanceConfirmed", "PaymentReleased"])
        .eq("claim_kind", "Reimbursement")
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
          .select("claim_id,expense_head,description,amount,billable_amount,expense_tag,client_invoice_number,payment_mode,vendor_name,vendor_invoice_number,site_or_department,transaction_date")
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
          company: (claim.company ?? "Nimbus") as BillableClaimReportRow["company"],
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
        company: claim?.company ?? "Nimbus",
        claimantName: claim ? employeeNames.get(claim.employeeId) ?? claim.employeeId : "Unknown",
        siteName,
        expenseHead: line.expense_head ? String(line.expense_head) : null,
        description: String(line.description),
        amount: Number(line.amount ?? 0),
        billableAmount: Number(line.billable_amount ?? (expenseTag === "PendingBilling" || expenseTag === "AlreadyBilled" ? line.amount : 0)),
        expenseTag,
        invoiceNumber,
        paymentMode: line.payment_mode ? line.payment_mode as BillableClaimReportRow["paymentMode"] : null,
        vendorName: line.vendor_name ? String(line.vendor_name) : null,
        vendorInvoiceNumber: line.vendor_invoice_number ? String(line.vendor_invoice_number) : null,
        siteOrDepartment: line.site_or_department ? String(line.site_or_department) : null,
        recoveryStatus:
          expenseTag === "AlreadyBilled" && invoiceNumber
            ? "Billed"
            : expenseTag === "PendingBilling"
              ? "B2C - Pending Billing"
              : "Non Billable",
        transactionDate: String(line.transaction_date)
      };
    });
  }

  async listCompanyExpenseReport(): Promise<CompanyExpenseReportRow[]> {
    const db = await getSupabaseAdminClient();
    const [{ data: claims, error: claimsError }, siteNames, employees] = await Promise.all([
      db
        .from("expense_claims")
        .select("claim_id,ticket_id,company,claim_kind,status,submitter_employee_id,site_id,total_amount,advance_amount,advance_adjustment_amount,final_payable_amount,updated_at")
        .eq("is_deleted", false)
        .order("updated_at", { ascending: false })
        .limit(2_000),
      this.getSiteNameMap(),
      this.listEmployees()
    ]);

    if (claimsError) throw claimsError;

    const claimIds = (claims ?? []).map((claim) => String(claim.claim_id));
    const { data: lines, error: linesError } = claimIds.length
      ? await db
          .from("expense_line_items")
          .select("claim_id,expense_head,description,amount,billable_amount,expense_tag,client_invoice_number,vendor_name,vendor_invoice_number,transaction_date,payment_mode,finance_review_status,audit_review_status,audit_approved_amount")
          .in("claim_id", claimIds)
          .eq("is_deleted", false)
          .limit(10_000)
      : { data: [], error: null };

    if (linesError) throw linesError;

    const employeeNames = new Map(employees.map((employee) => [employee.employeeId, employee.fullName]));
    const claimsById = new Map(
      (claims ?? []).map((claim) => [
        String(claim.claim_id),
        {
          ticketId: String(claim.ticket_id),
          company: (claim.company ?? "Nimbus") as CompanyExpenseReportRow["company"],
          claimKind: (claim.claim_kind ?? "Reimbursement") as CompanyExpenseReportRow["claimKind"],
          status: claim.status as CompanyExpenseReportRow["status"],
          employeeId: String(claim.submitter_employee_id),
          siteId: claim.site_id ? String(claim.site_id) : null,
          advanceAmount: Number(claim.advance_amount ?? 0),
          advanceAdjustmentAmount: Number(claim.advance_adjustment_amount ?? 0),
          finalPayableAmount: Number(claim.final_payable_amount ?? claim.total_amount ?? 0),
          updatedAt: String(claim.updated_at)
        }
      ])
    );

    return (lines ?? []).map((line) => {
      const claim = claimsById.get(String(line.claim_id));
      const amount = Number(line.amount ?? 0);
      const expenseTag = line.expense_tag as CompanyExpenseReportRow["expenseTag"];
      const billableAmount =
        expenseTag === "PendingBilling" || expenseTag === "AlreadyBilled"
          ? Number(line.billable_amount ?? amount)
          : 0;
      const ctcAmount = expenseTag === "BackendCTC" ? amount : 0;
      const contractualPartAmount = expenseTag === "ContractPartCost" ? amount : 0;
      const nonBillableAmount = billableAmount === 0 && ctcAmount === 0 && contractualPartAmount === 0 ? amount : 0;
      const siteName = claim?.siteId ? siteNames.get(claim.siteId) ?? claim.siteId : null;

      return {
        ticketId: claim?.ticketId ?? String(line.claim_id),
        company: claim?.company ?? "Nimbus",
        claimKind: claim?.claimKind ?? "Reimbursement",
        status: claim?.status ?? "Draft",
        claimantName: claim ? employeeNames.get(claim.employeeId) ?? claim.employeeId : "Unknown",
        siteName,
        expenseHead: line.expense_head ? String(line.expense_head) : null,
        description: String(line.description),
        amount,
        billableAmount,
        nonBillableAmount,
        ctcAmount,
        contractualPartAmount,
        expenseTag,
        clientInvoiceNumber: line.client_invoice_number ? String(line.client_invoice_number) : null,
        vendorName: line.vendor_name ? String(line.vendor_name) : null,
        vendorInvoiceNumber: line.vendor_invoice_number ? String(line.vendor_invoice_number) : null,
        transactionDate: String(line.transaction_date),
        paymentMode: line.payment_mode ? line.payment_mode as CompanyExpenseReportRow["paymentMode"] : null,
        financeReviewStatus: (line.finance_review_status ?? "Pending") as CompanyExpenseReportRow["financeReviewStatus"],
        auditReviewStatus: (line.audit_review_status ?? "Pending") as CompanyExpenseReportRow["auditReviewStatus"],
        auditApprovedAmount: line.audit_approved_amount === null || line.audit_approved_amount === undefined ? null : Number(line.audit_approved_amount),
        advanceAmount: claim?.advanceAmount ?? 0,
        advanceAdjustmentAmount: claim?.advanceAdjustmentAmount ?? 0,
        finalPayableAmount: claim?.finalPayableAmount ?? amount,
        updatedAt: claim?.updatedAt ?? String(line.transaction_date)
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
      ticketId: claim.ticketId,
      company: claim.company,
      submittedBy: claim.submitterEmployeeId,
      submittedByRole: "Claimant",
      siteName: claim.siteId ? siteNames.get(claim.siteId) ?? claim.siteId : null,
      totalAmount: claim.totalAmount,
      advanceAdjustmentAmount: claim.advanceAdjustmentAmount,
      finalPayableAmount: claim.finalPayableAmount,
      netAdvanceLeftAmount: claim.netAdvanceLeftAmount,
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
        vendorName: line.vendorName,
        vendorInvoiceNumber: line.vendorInvoiceNumber,
        missingReceiptFlag: line.missingReceiptFlag,
        receiptAttachmentCount: line.attachments.length
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
