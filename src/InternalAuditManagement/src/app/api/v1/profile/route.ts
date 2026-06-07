import { NextRequest, NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";
import { updateBankDetailsSchema } from "@/server/validation/claim.schemas";

export async function GET() {
  const user = await getUserContext();
  try {
    return NextResponse.json(await getClaimService().getProfile(user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getUserContext();
  try {
    const input = updateBankDetailsSchema.parse(await request.json());
    return NextResponse.json(await getClaimService().updateProfileBankDetails(input, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
