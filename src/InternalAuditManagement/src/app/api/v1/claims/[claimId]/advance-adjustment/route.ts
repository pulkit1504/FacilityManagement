import { NextRequest, NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";
import { updateSettlementAdjustmentSchema } from "@/server/validation/claim.schemas";

export async function PATCH(request: NextRequest, context: { params: Promise<{ claimId: string }> }) {
  const user = await getUserContext();
  try {
    const { claimId } = await context.params;
    const body = updateSettlementAdjustmentSchema.parse(await request.json());
    return NextResponse.json(await getClaimService().updateSettlementAdjustment(claimId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
