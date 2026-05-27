import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";
import { createLineItemSchema } from "@/server/validation/claim.schemas";

type RouteContext = {
  params: Promise<{ claimId: string; lineItemId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId, lineItemId } = await context.params;
    const body = createLineItemSchema.parse(await request.json());
    return NextResponse.json(await getClaimService().updateLineItem(claimId, lineItemId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId, lineItemId } = await context.params;
    return NextResponse.json(await getClaimService().deleteLineItem(claimId, lineItemId, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
