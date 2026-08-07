import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAdminService } from "@/server/services/service-factory";

type Params = {
  params: Promise<{ expenseHeadId: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const user = await getUserContext();
  try {
    const { expenseHeadId } = await params;
    return NextResponse.json(await getAdminService().deactivateExpenseHead(expenseHeadId, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
