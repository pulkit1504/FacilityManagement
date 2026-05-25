import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getApprovalService } from "@/server/services/service-factory";
import { approveClaimSchema } from "@/server/validation/claim.schemas";

type RouteContext = {
  params: Promise<{ claimId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId } = await context.params;
    const body = approveClaimSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await getApprovalService().approveClaim(claimId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
