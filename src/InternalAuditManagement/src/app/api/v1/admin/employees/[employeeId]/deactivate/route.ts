import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAdminService } from "@/server/services/service-factory";

type RouteContext = {
  params: Promise<{ employeeId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { employeeId } = await context.params;
    return NextResponse.json(await getAdminService().deactivateEmployee(employeeId, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
