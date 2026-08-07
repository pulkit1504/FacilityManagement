import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAdminService } from "@/server/services/service-factory";
import { createExpenseHeadSchema } from "@/server/validation/claim.schemas";

export async function GET() {
  const user = await getUserContext();
  try {
    return NextResponse.json(await getAdminService().listExpenseHeads(user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}

export async function POST(request: Request) {
  const user = await getUserContext();
  try {
    const body = createExpenseHeadSchema.parse(await request.json());
    return NextResponse.json(await getAdminService().createExpenseHead(body, user), { status: 201 });
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
