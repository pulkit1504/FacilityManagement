import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAuditService } from "@/server/services/service-factory";
import { lineExpenseHeadCorrectionSchema } from "@/server/validation/claim.schemas";

type RouteContext = {
  params: Promise<{ claimId: string; lineItemId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId, lineItemId } = await context.params;
    const body = lineExpenseHeadCorrectionSchema.parse(await request.json());
    return NextResponse.json(await getAuditService().correctLineItemExpenseHead(claimId, lineItemId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
