import { SupabaseClaimRepository } from "../repositories/supabase-claim-repository";
import { ApprovalService } from "./approval-service";
import { AdminService } from "./admin-service";
import { BillingService } from "./billing-service";
import { ClaimService } from "./claim-service";
import { DashboardService } from "./dashboard-service";
import { FinanceService } from "./finance-service";
import { FraudService } from "./fraud-service";
import { ReceiptService } from "./receipt-service";
import { AzureBlobFileStorageService } from "../storage/file-storage-service";

let claimService: ClaimService | null = null;
let adminService: AdminService | null = null;
let approvalService: ApprovalService | null = null;
let billingService: BillingService | null = null;
let dashboardService: DashboardService | null = null;
let financeService: FinanceService | null = null;
let fraudService: FraudService | null = null;
let receiptService: ReceiptService | null = null;
let repository: SupabaseClaimRepository | null = null;
let fileStorage: AzureBlobFileStorageService | null = null;

export function getRepository() {
  repository ??= new SupabaseClaimRepository();
  return repository;
}

export function getClaimService() {
  if (!claimService) {
    claimService = new ClaimService(getRepository());
  }

  return claimService;
}

export function getApprovalService() {
  approvalService ??= new ApprovalService(getRepository());
  return approvalService;
}

export function getAdminService() {
  adminService ??= new AdminService(getRepository());
  return adminService;
}

export function getBillingService() {
  billingService ??= new BillingService(getRepository());
  return billingService;
}

export function getDashboardService() {
  dashboardService ??= new DashboardService(getRepository());
  return dashboardService;
}

export function getFinanceService() {
  financeService ??= new FinanceService(getRepository());
  return financeService;
}

export function getFraudService() {
  fraudService ??= new FraudService(getRepository());
  return fraudService;
}

export function getReceiptService() {
  fileStorage ??= new AzureBlobFileStorageService();
  receiptService ??= new ReceiptService(getRepository(), fileStorage);
  return receiptService;
}
