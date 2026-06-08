import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { auditClaimDecisionSchema } from "@/server/validation/claim.schemas";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAuditService } from "@/server/services/service-factory";

export async function POST(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const user = await getUserContext();
  try {
    const { claimId } = await params;
    const body = auditClaimDecisionSchema.parse(await request.json());
    return NextResponse.json(await getAuditService().approveClaim(claimId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
