import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getFraudService } from "@/server/services/service-factory";

export async function POST() {
  const user = await getUserContext();
  try {
    return NextResponse.json(await getFraudService().runSweep(user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
