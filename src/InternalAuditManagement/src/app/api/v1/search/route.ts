import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";

export async function GET(request: Request) {
  const user = await getUserContext();
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const result = await getClaimService().searchRecords(query, user);
    return NextResponse.json(result);
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
