import { SupabaseClaimRepository } from "../repositories/supabase-claim-repository";
import { ApprovalService } from "./approval-service";
import { ClaimService } from "./claim-service";
import { FinanceService } from "./finance-service";

let claimService: ClaimService | null = null;
let approvalService: ApprovalService | null = null;
let financeService: FinanceService | null = null;
let repository: SupabaseClaimRepository | null = null;

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
