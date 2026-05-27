import { forbidden } from "../errors/application-error";
import type { UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { CreateContractInput, CreateSiteInput } from "../validation/claim.schemas";

export class AdminService {
  constructor(private readonly claims: ClaimRepository) {}

  async listMasterData(user: UserContext) {
    this.assertAdmin(user);
    const [contracts, sites] = await Promise.all([
      this.claims.listContracts(),
      this.claims.listActiveSites()
    ]);

    return { contracts, sites };
  }

  async createContract(input: CreateContractInput, user: UserContext) {
    this.assertAdmin(user);
    return {
      contract: await this.claims.createContract(input),
      message: "Contract created."
    };
  }

  async createSite(input: CreateSiteInput, user: UserContext) {
    this.assertAdmin(user);
    return {
      site: await this.claims.createSite(input),
      message: "Site created."
    };
  }

  async deactivateSite(siteId: string, user: UserContext) {
    this.assertAdmin(user);
    await this.claims.deactivateSite(siteId);
    return {
      siteId,
      message: "Site marked inactive."
    };
  }

  private assertAdmin(user: UserContext) {
    if (!["MD", "FinanceHOD"].includes(user.role)) {
      throw forbidden("Only MD and Finance HOD users can manage site and contract master data.");
    }
  }
}
