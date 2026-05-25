import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";
import { createLineItemSchema } from "@/server/validation/claim.schemas";

type RouteContext = {
  params: Promise<{ claimId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId } = await context.params;
    const body = createLineItemSchema.parse(await request.json());
    const result = await getClaimService().addLineItem(claimId, body, user);
    return NextResponse.json(
      {
        lineItemId: result.lineItemId,
        missingReceiptFlag: result.missingReceiptFlag,
        message: "Line item added. Don't forget to attach a receipt."
      },
      { status: 201 }
    );
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
