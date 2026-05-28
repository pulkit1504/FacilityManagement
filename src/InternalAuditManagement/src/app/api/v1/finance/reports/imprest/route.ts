import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getFinanceService } from "@/server/services/service-factory";

export async function GET(request: Request) {
  const user = await getUserContext();
  try {
    const url = new URL(request.url);
    const csv = await getFinanceService().exportImprestLedger(user, {
      site: url.searchParams.get("site"),
      claimant: url.searchParams.get("claimant"),
      month: url.searchParams.get("month")
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="imprest-ledger.csv"'
      }
    });
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
