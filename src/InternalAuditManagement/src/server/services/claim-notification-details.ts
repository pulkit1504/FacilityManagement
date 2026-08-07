import type { ClaimDetail } from "../domain/types";

export function claimNotificationBody(claim: ClaimDetail, claimantName: string, siteName: string | null, intro: string) {
  const period = claim.claimPeriodMonth
    ? new Date(`${claim.claimPeriodMonth.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
    : "Not specified";
  return [
    intro,
    `Claimant: ${claimantName}`,
    `Claim type: ${claim.claimKind}`,
    `Site: ${siteName ?? claim.siteId ?? "Not specified"}`,
    `Claim period: ${period}`,
    `Line items: ${claim.lineItems.length}`,
    `Total amount: Rs ${claim.totalAmount.toLocaleString("en-IN")}`
  ].join("\n");
}
