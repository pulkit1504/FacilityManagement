import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";
import { createClaimSchema } from "@/server/validation/claim.schemas";

export async function GET() {
  const user = await getUserContext();
  try {
    const result = await getClaimService().listClaims(user);
    return NextResponse.json(result);
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}

export async function POST(request: Request) {
  const user = await getUserContext();
  try {
    const body = createClaimSchema.parse(await request.json());
    const result = await getClaimService().createClaim(body, user);
    return NextResponse.json(result, {
      status: 201,
      headers: {
        Location: `/api/v1/claims/${result.claimId}`
      }
    });
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
