import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAdminService } from "@/server/services/service-factory";
import { updateExpenseHeadSchema } from "@/server/validation/claim.schemas";

type Params = {
  params: Promise<{ expenseHeadId: string }>;
};

export async function PUT(request: Request, { params }: Params) {
  const user = await getUserContext();
  try {
    const { expenseHeadId } = await params;
    const body = updateExpenseHeadSchema.parse(await request.json());
    return NextResponse.json(await getAdminService().updateExpenseHead(expenseHeadId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
