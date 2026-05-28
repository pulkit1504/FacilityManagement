import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";
import { createAdvanceRequestSchema } from "@/server/validation/claim.schemas";

export async function GET() {
  const user = await getUserContext();
  try {
    return NextResponse.json(await getClaimService().listPendingAdvances(user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}

export async function POST(request: Request) {
  const user = await getUserContext();
  try {
    const body = createAdvanceRequestSchema.parse(await request.json());
    return NextResponse.json(await getClaimService().createAdvanceRequest(body, user), { status: 201 });
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
