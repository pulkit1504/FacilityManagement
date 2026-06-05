import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import type { UserContext } from "@/server/domain/types";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getDashboardService } from "@/server/services/service-factory";

export async function GET() {
  let user: UserContext | undefined;
  const traceId = crypto.randomUUID();
  try {
    user = await getUserContext();
    return NextResponse.json(await getDashboardService().getOverview(user));
  } catch (error) {
    return toProblemResponse(error, user?.correlationId ?? traceId);
  }
}
