import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAdminService } from "@/server/services/service-factory";

type RouteContext = {
  params: Promise<{ holidayDate: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { holidayDate } = await context.params;
    return NextResponse.json(await getAdminService().deleteHoliday(holidayDate, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
