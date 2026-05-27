import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAdminService } from "@/server/services/service-factory";
import { createContractSchema } from "@/server/validation/claim.schemas";

export async function POST(request: Request) {
  const user = await getUserContext();
  try {
    const body = createContractSchema.parse(await request.json());
    return NextResponse.json(await getAdminService().createContract(body, user), { status: 201 });
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
