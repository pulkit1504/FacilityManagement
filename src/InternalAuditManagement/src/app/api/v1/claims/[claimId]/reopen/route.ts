import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";

type RouteContext = {
  params: Promise<{ claimId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId } = await context.params;
    return NextResponse.json(await getClaimService().reopenReturnedClaim(claimId, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
