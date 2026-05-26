import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import type { FraudFlagStatus } from "@/server/domain/types";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getFraudService } from "@/server/services/service-factory";

export async function GET(request: Request) {
  const user = await getUserContext();
  try {
    const url = new URL(request.url);
    const status = (url.searchParams.get("status") ?? "Open") as FraudFlagStatus;
    return NextResponse.json(await getFraudService().listFlags(user, status));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
