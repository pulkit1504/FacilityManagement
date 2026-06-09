import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAuditService } from "@/server/services/service-factory";

export async function POST(_request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const user = await getUserContext();
  try {
    const { claimId } = await params;
    return NextResponse.json(await getAuditService().receiveVouchers(claimId, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
