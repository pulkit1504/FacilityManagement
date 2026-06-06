import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAdminService } from "@/server/services/service-factory";
import { cleanupStaleRecordsSchema } from "@/server/validation/claim.schemas";

export async function POST(request: Request) {
  const user = await getUserContext();
  try {
    const body = cleanupStaleRecordsSchema.parse(await request.json());
    return NextResponse.json(await getAdminService().cleanupStaleRecords(body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
