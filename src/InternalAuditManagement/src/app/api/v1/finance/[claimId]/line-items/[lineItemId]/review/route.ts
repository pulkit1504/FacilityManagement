import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getFinanceService } from "@/server/services/service-factory";
import { financeLineReviewSchema } from "@/server/validation/claim.schemas";

type RouteContext = {
  params: Promise<{ claimId: string; lineItemId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId, lineItemId } = await context.params;
    const body = financeLineReviewSchema.parse(await request.json());
    return NextResponse.json(await getFinanceService().reviewLineItem(claimId, lineItemId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
