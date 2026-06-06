import { SupabaseClaimRepository } from "../repositories/supabase-claim-repository";
import { ApprovalService } from "./approval-service";
import { AdminService } from "./admin-service";
import { BillingService } from "./billing-service";
import { ClaimService } from "./claim-service";
import { DashboardService } from "./dashboard-service";
import { FinanceService } from "./finance-service";
import { FraudService } from "./fraud-service";
import { NotificationService } from "./notification-service";
import { ReceiptService } from "./receipt-service";
import { AzureBlobFileStorageService } from "../storage/file-storage-service";
import { instrumentAsyncMethods } from "../observability/performance";

let claimService: ClaimService | null = null;
let adminService: AdminService | null = null;
let approvalService: ApprovalService | null = null;
let billingService: BillingService | null = null;
let dashboardService: DashboardService | null = null;
let financeService: FinanceService | null = null;
let fraudService: FraudService | null = null;
let notificationService: NotificationService | null = null;
let receiptService: ReceiptService | null = null;
let repository: SupabaseClaimRepository | null = null;
let fileStorage: AzureBlobFileStorageService | null = null;

export function getRepository() {
  repository ??= instrumentAsyncMethods(new SupabaseClaimRepository(), "repository.supabaseClaim");
  return repository;
}

export function getClaimService() {
  if (!claimService) {
    claimService = instrumentAsyncMethods(new ClaimService(getRepository(), getNotificationService()), "service.claim");
  }

  return claimService;
}

export function getApprovalService() {
  approvalService ??= instrumentAsyncMethods(new ApprovalService(getRepository(), getNotificationService()), "service.approval");
  return approvalService;
}

export function getAdminService() {
  adminService ??= instrumentAsyncMethods(new AdminService(getRepository(), getNotificationService()), "service.admin");
  return adminService;
}

export function getBillingService() {
  billingService ??= instrumentAsyncMethods(new BillingService(getRepository()), "service.billing");
  return billingService;
}

export function getDashboardService() {
  dashboardService ??= instrumentAsyncMethods(new DashboardService(getRepository()), "service.dashboard");
  return dashboardService;
}

export function getFinanceService() {
  financeService ??= instrumentAsyncMethods(new FinanceService(getRepository(), getNotificationService()), "service.finance");
  return financeService;
}

export function getFraudService() {
  fraudService ??= instrumentAsyncMethods(new FraudService(getRepository()), "service.fraud");
  return fraudService;
}

export function getNotificationService() {
  notificationService ??= instrumentAsyncMethods(new NotificationService(getRepository()), "service.notification");
  return notificationService;
}

export function getReceiptService() {
  fileStorage ??= new AzureBlobFileStorageService();
  receiptService ??= instrumentAsyncMethods(new ReceiptService(getRepository(), fileStorage), "service.receipt");
  return receiptService;
}
