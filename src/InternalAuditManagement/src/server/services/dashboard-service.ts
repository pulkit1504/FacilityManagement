import { forbidden } from "../errors/application-error";
import type { UserContext, UserRole } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";

const misDashboardRoles: readonly UserRole[] = ["ClusterHead", "HOD", "MD", "Finance", "FinanceHOD", "BillingTeam", "Admin"];

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
    if (!misDashboardRoles.includes(user.role)) {
      throw forbidden("Your role cannot access the MIS dashboard.");
    }

    const metrics = await this.claims.getMisDashboardMetrics(user.userId, user.role);

    return {
      generatedAt: new Date().toISOString(),
      metrics
    };
  }
}
