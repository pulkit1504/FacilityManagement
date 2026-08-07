import { NextResponse } from "next/server";
import { getUserContext } from "@/server/auth/user-context";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getAdminService } from "@/server/services/service-factory";
import { assignSiteClusterHeadSchema, updateSiteSchema } from "@/server/validation/claim.schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const user = await getUserContext();
  try {
    const { siteId } = await params;
    const body = assignSiteClusterHeadSchema.parse(await request.json());
    return NextResponse.json(await getAdminService().assignSiteClusterHead(siteId, body.clusterHeadEmployeeId, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const user = await getUserContext();
  try {
    const { siteId } = await params;
    const body = updateSiteSchema.parse(await request.json());
    return NextResponse.json(await getAdminService().updateSite(siteId, body, user));
  } catch (error) {
    return toProblemResponse(error, user.correlationId);
  }
}
