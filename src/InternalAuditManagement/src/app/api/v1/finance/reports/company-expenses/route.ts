import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getFinanceService } from "@/server/services/service-factory";

export async function GET(request: Request) {
  const user = await getUserContext();
  try {
    const url = new URL(request.url);
    const company = parseCompany(url.searchParams.get("company"));
    const month = url.searchParams.get("month");
    const csv = await getFinanceService().exportCompanyExpenses(user, {
      site: url.searchParams.get("site"),
      claimant: url.searchParams.get("claimant"),
      month,
      company
    });
    const filenameParts = ["company-expense-report"];
    if (company !== "All") filenameParts.push(company.toLowerCase());
    if (month) filenameParts.push(month);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameParts.join("-")}.csv"`
      }
    });
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}

function parseCompany(value: string | null) {
  return value === "Nimbus" || value === "Striker" ? value : "All";
}
