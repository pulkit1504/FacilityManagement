import { SupabaseClaimRepository } from "../repositories/supabase-claim-repository";
import { ClaimService } from "./claim-service";

let claimService: ClaimService | null = null;

export function getClaimService() {
  if (!claimService) {
    claimService = new ClaimService(new SupabaseClaimRepository());
  }

  return claimService;
}
