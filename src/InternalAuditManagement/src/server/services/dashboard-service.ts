import { forbidden } from "../errors/application-error";
import type { UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";

export class DashboardService {
  constructor(private readonly claims: ClaimRepository) {}

  async getOverview(user: UserContext) {
    const metrics = await this.claims.getOverviewMetrics(user.userId, user.role);
    const canViewBillingMetrics = ["MD", "Finance", "BillingTeam", "Admin"].includes(user.role);
    const canViewFraudFlags = ["MD", "Auditor"].includes(user.role);

    return {
      generatedAt: new Date().toISOString(),
      metrics: {
        ...metrics,
        activeBillingAlerts: canViewBillingMetrics ? metrics.activeBillingAlerts : 0,
        billingRecoveryPct: canViewBillingMetrics ? metrics.billingRecoveryPct : null,
        openFraudFlags: canViewFraudFlags ? metrics.openFraudFlags : 0,
        canViewBillingMetrics,
        canViewFraudFlags
      }
    };
  }

  async getMisDashboard(user: UserContext) {
    if (!["MD", "Finance", "BillingTeam", "Admin"].includes(user.role)) {
      throw forbidden("You do not have access to billing recovery metrics.");
    }

    const metrics = await this.claims.getMisDashboardMetrics();

    return {
      generatedAt: new Date().toISOString(),
      metrics
    };
  }
}
