import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";
import { submitClaimSchema } from "@/server/validation/claim.schemas";

type RouteContext = {
  params: Promise<{ claimId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId } = await context.params;
    const body = submitClaimSchema.parse(await request.json().catch(() => ({})));
    const result = await getClaimService().submitClaim(claimId, user, body.outstandingAdvancesReviewed);
    return NextResponse.json(result);
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
