import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";

type RouteContext = {
  params: Promise<{ claimId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId } = await context.params;
    const csv = await getClaimService().exportClaimAuditTrail(claimId, user);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="claim-${claimId}-audit-trail.csv"`
      }
    });
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
