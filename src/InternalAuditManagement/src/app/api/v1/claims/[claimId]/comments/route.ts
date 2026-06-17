import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getClaimService } from "@/server/services/service-factory";

type RouteContext = {
  params: Promise<{ claimId: string }>;
};

const commentSchema = z.object({
  message: z.string().trim().min(3).max(1000)
});

export async function POST(request: Request, context: RouteContext) {
  const user = await getUserContext();
  try {
    const { claimId } = await context.params;
    const body = commentSchema.parse(await request.json());
    const result = await getClaimService().addClaimComment(claimId, body.message, user);
    return NextResponse.json(result);
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
