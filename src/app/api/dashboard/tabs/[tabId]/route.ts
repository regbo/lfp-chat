import { z } from "zod";

import { archiveDashboardTab } from "@/lib/dashboard-store";
import { resolveUserScope } from "@/lib/user-scope";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ tabId: string }> },
) {
  const parsed = z.object({ resourceId: z.string(), archived: z.boolean() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const scope = await resolveUserScope(request.headers, parsed.data.resourceId);
  if (!scope.ok) return scope.response;
  const { tabId } = await context.params;
  return Response.json(await archiveDashboardTab(scope.scope.resourceId, tabId, parsed.data.archived));
}
