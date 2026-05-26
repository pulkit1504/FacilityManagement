import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getFraudService } from "@/server/services/service-factory";
import { reviewFraudFlagSchema } from "@/server/validation/claim.schemas";

type RouteContext = {
  params: Promise<{ flagId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { flagId } = await context.params;
    const body = reviewFraudFlagSchema.parse(await request.json());
    return NextResponse.json(await getFraudService().reviewFlag(flagId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
