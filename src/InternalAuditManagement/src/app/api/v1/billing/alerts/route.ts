import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getBillingService } from "@/server/services/service-factory";

export async function GET(request: Request) {
  const user = await getUserContext();
  try {
    const url = new URL(request.url);
    const isResolved = url.searchParams.get("isResolved") === "true";
    return NextResponse.json(await getBillingService().listAlerts(user, isResolved));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
