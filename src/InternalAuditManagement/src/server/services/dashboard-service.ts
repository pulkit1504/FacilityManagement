import { forbidden } from "../errors/application-error";
import type { UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";

export class DashboardService {
  constructor(private readonly claims: ClaimRepository) {}

  async getOverview(user: UserContext) {
    const metrics = await this.claims.getOverviewMetrics(user.userId, user.role);

    return {
      generatedAt: new Date().toISOString(),
      metrics
    };
  }

  async getMisDashboard(user: UserContext) {
    if (user.role === "Claimant") {
      throw forbidden("Claimant users cannot access the MIS dashboard.");
    }

    const metrics = await this.claims.getMisDashboardMetrics();

    return {
      generatedAt: new Date().toISOString(),
      metrics
    };
  }
}
