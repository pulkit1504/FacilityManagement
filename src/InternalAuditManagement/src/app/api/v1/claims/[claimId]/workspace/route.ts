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
    const result = await getClaimService().getClaimWorkspace(claimId, user);
    return NextResponse.json(result);
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
