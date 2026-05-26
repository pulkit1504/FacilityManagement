import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getDashboardService } from "@/server/services/service-factory";

export async function GET() {
  const user = await getUserContext();
  try {
    return NextResponse.json(await getDashboardService().getOverview(user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
