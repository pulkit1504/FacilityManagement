import { SupabaseClaimRepository } from "../repositories/supabase-claim-repository";
import { ApprovalService } from "./approval-service";
import { ClaimService } from "./claim-service";
import { FinanceService } from "./finance-service";
import { ReceiptService } from "./receipt-service";
import { AzureBlobFileStorageService } from "../storage/file-storage-service";

let claimService: ClaimService | null = null;
let approvalService: ApprovalService | null = null;
let financeService: FinanceService | null = null;
let receiptService: ReceiptService | null = null;
let repository: SupabaseClaimRepository | null = null;
let fileStorage: AzureBlobFileStorageService | null = null;

function getRepository() {
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

export function getFinanceService() {
  financeService ??= new FinanceService(getRepository());
  return financeService;
}

export function getReceiptService() {
  fileStorage ??= new AzureBlobFileStorageService();
  receiptService ??= new ReceiptService(getRepository(), fileStorage);
  return receiptService;
}
