import { NextRequest, NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";
import { changePasswordSchema } from "@/server/validation/claim.schemas";

export async function PATCH(request: NextRequest) {
  const user = await getUserContext();
  try {
    const input = changePasswordSchema.parse(await request.json());
    return NextResponse.json(await getClaimService().changeProfilePassword(input, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
