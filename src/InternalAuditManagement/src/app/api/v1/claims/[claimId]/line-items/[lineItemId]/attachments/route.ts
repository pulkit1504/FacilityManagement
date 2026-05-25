import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { conflict } from "@/server/errors/application-error";
import { getReceiptService } from "@/server/services/service-factory";

type RouteContext = {
  params: Promise<{ claimId: string; lineItemId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId, lineItemId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw conflict("A receipt file is required.");
    }

    const result = await getReceiptService().uploadReceipt({ claimId, lineItemId, file }, user);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
