import { forbidden, notFound } from "../errors/application-error";
import type { ClaimDetail, ExpenseLineItem, FraudFlagStatus, UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { ReviewFraudFlagInput } from "../validation/claim.schemas";

type CandidateLine = ExpenseLineItem & {
  submitterEmployeeId: string;
  claimStatus: ClaimDetail["status"];
};

export class FraudService {
  constructor(private readonly claims: ClaimRepository) {}

  async listFlags(user: UserContext, status: FraudFlagStatus = "Open") {
    this.assertAuditAccess(user);
    const flags = await this.claims.listFraudFlags(status);

    return {
      openFlagsCount: status === "Open" ? flags.length : undefined,
      flagsByRule: flags.reduce<Record<string, number>>((acc, flag) => {
        acc[flag.ruleName] = (acc[flag.ruleName] ?? 0) + 1;
        return acc;
      }, {}),
      flags
    };
  }

  async runSweep(user: UserContext) {
    this.assertAuditAccess(user);

    const claims = await this.claims.listClaimsForFraudSweep();
    const holidays = new Set(await this.claims.listHolidayDates());
    const lines = this.flattenClaims(claims);
    const sweepDate = new Date().toISOString().slice(0, 10);
    const createdFlagIds: string[] = [];

    for (const group of this.findDuplicateVoucherGroups(lines)) {
      const flag = await this.claims.createFraudFlag({
        primaryClaimId: group[0].claimId,
        relatedClaimIds: group.slice(1).map((item) => item.claimId),
        ruleName: "DuplicateVoucher",
        sweepDate
      });
      if (flag) createdFlagIds.push(flag.flagId);
    }

    for (const group of this.findThresholdSplitGroups(lines)) {
      const flag = await this.claims.createFraudFlag({
        primaryClaimId: group[0].claimId,
        relatedClaimIds: group.slice(1).map((item) => item.claimId),
        ruleName: "ThresholdSplit",
        sweepDate
      });
      if (flag) createdFlagIds.push(flag.flagId);
    }

    for (const line of lines.filter((item) => item.expenseTag === "BackendCTC" && this.isNonOperationalDate(item.transactionDate, holidays))) {
      const flag = await this.claims.createFraudFlag({
        primaryClaimId: line.claimId,
        relatedClaimIds: [],
        ruleName: "WeekendOutlier",
        sweepDate
      });
      if (flag) createdFlagIds.push(flag.flagId);
    }

    for (const flagId of createdFlagIds) {
      const flag = (await this.claims.listFraudFlags("Open")).find((item) => item.flagId === flagId);
      if (!flag) continue;
      await this.claims.appendAuditLog({
        claimId: flag.primaryClaimId,
        actorUserId: user.userId,
        actionType: "FRAUD_FLAG",
        preActionStatus: "Open",
        postActionStatus: "Open",
        auditRemarks: `${flag.ruleName} fraud flag created`,
        correlationId: user.correlationId
      });
    }

    return {
      sweepDate,
      evaluatedClaims: claims.length,
      createdFlagsCount: createdFlagIds.length,
      createdFlagIds
    };
  }

  async reviewFlag(flagId: string, input: ReviewFraudFlagInput, user: UserContext) {
    this.assertAuditAccess(user);

    const reviewed = await this.claims.reviewFraudFlag(flagId, input.decision, input.remarks, user.userId);
    if (!reviewed) throw notFound("Fraud flag was not found.");

    await this.claims.appendAuditLog({
      claimId: reviewed.primaryClaimId,
      actorUserId: user.userId,
      actionType: input.decision === "Cleared" ? "FRAUD_CLEAR" : "FRAUD_ESCALATE",
      preActionStatus: "Open",
      postActionStatus: reviewed.status,
      auditRemarks: input.remarks,
      correlationId: user.correlationId
    });

    return {
      flagId: reviewed.flagId,
      decision: reviewed.status,
      message: `Flag ${reviewed.status.toLowerCase()}. Audit trail recorded.`
    };
  }

  private flattenClaims(claims: ClaimDetail[]): CandidateLine[] {
    return claims.flatMap((claim) =>
      claim.lineItems.map((item) => ({
        ...item,
        submitterEmployeeId: claim.submitterEmployeeId,
        claimStatus: claim.status
      }))
    );
  }

  private findDuplicateVoucherGroups(lines: CandidateLine[]) {
    const groups = new Map<string, CandidateLine[]>();
    for (const line of lines) {
      const key = `${line.transactionDate}|${line.amount.toFixed(2)}`;
      groups.set(key, [...(groups.get(key) ?? []), line]);
    }

    return [...groups.values()].filter(
      (group) => group.length > 1 && new Set(group.map((item) => item.submitterEmployeeId)).size > 1
    );
  }

  private findThresholdSplitGroups(lines: CandidateLine[]) {
    const byEmployee = new Map<string, CandidateLine[]>();
    for (const line of lines) {
      byEmployee.set(line.submitterEmployeeId, [...(byEmployee.get(line.submitterEmployeeId) ?? []), line]);
    }

    const groups: CandidateLine[][] = [];
    for (const employeeLines of byEmployee.values()) {
      const sorted = [...employeeLines].sort(
        (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
      );

      for (let index = 0; index < sorted.length; index += 1) {
        const windowStart = new Date(sorted[index].transactionDate).getTime();
        const group = sorted.filter((line) => {
          const transactionTime = new Date(line.transactionDate).getTime();
          return transactionTime >= windowStart && transactionTime <= windowStart + 48 * 60 * 60 * 1000;
        });

        const amountsLookSplit = group.length >= 3 && group.every((line) => line.amount >= 0.8 * Math.max(...group.map((item) => item.amount)));
        if (amountsLookSplit) {
          groups.push(group);
          break;
        }
      }
    }

    return groups;
  }

  private isNonOperationalDate(dateValue: string, holidays: Set<string>) {
    const day = new Date(`${dateValue}T00:00:00Z`).getUTCDay();
    return day === 0 || day === 6 || holidays.has(dateValue);
  }

  private assertAuditAccess(user: UserContext) {
    if (!["Auditor", "MD"].includes(user.role)) {
      throw forbidden("Only Auditor or MD can access fraud review.");
    }
  }
}
