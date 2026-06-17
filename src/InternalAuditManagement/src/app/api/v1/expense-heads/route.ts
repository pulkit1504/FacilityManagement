import { NextResponse } from "next/server";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getRepository } from "@/server/services/service-factory";

export async function GET() {
  const traceId = crypto.randomUUID();
  try {
    return NextResponse.json({ items: await getRepository().listExpenseHeads(false) });
  } catch (error) {
    return toProblemResponse(error, traceId);
  }
}
