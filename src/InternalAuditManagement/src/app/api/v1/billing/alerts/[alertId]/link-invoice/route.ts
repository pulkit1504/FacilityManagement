import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getBillingService } from "@/server/services/service-factory";
import { linkInvoiceSchema } from "@/server/validation/claim.schemas";

type RouteContext = {
  params: Promise<{ alertId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { alertId } = await context.params;
    const body = linkInvoiceSchema.parse(await request.json());
    return NextResponse.json(await getBillingService().linkInvoice(alertId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
