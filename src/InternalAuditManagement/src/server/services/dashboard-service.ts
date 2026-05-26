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
}
