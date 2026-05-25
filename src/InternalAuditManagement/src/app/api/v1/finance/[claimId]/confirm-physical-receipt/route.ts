import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getFinanceService } from "@/server/services/service-factory";
import { confirmPhysicalReceiptSchema } from "@/server/validation/claim.schemas";

type RouteContext = {
  params: Promise<{ claimId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId } = await context.params;
    const body = confirmPhysicalReceiptSchema.parse(await request.json());
    return NextResponse.json(await getFinanceService().confirmPhysicalReceipt(claimId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
