import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";

export async function GET() {
  const user = await getUserContext();
  try {
    const result = await getClaimService().listUserNotifications(user);
    return NextResponse.json(result);
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
