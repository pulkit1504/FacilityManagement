import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getFinanceService } from "@/server/services/service-factory";

export async function GET() {
  const user = await getUserContext();
  try {
    const csv = await getFinanceService().exportBillableClaims(user);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="billable-claim-recovery.csv"'
      }
    });
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
