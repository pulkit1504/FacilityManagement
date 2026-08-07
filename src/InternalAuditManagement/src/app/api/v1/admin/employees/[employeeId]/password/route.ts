import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAdminService } from "@/server/services/service-factory";
import { resetEmployeePasswordSchema } from "@/server/validation/claim.schemas";

type Params = {
  params: Promise<{ employeeId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const user = await getUserContext();
  try {
    const { employeeId } = await params;
    const body = resetEmployeePasswordSchema.parse(await request.json());
    return NextResponse.json(await getAdminService().resetEmployeePassword(employeeId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
