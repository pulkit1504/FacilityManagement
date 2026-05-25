import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getReceiptService } from "@/server/services/service-factory";

type RouteContext = {
  params: Promise<{ claimId: string; lineItemId: string; attachmentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const params = await context.params;
    const result = await getReceiptService().createDownloadUrl(params, user);
    return NextResponse.json(result);
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
