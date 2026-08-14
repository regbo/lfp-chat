import { z } from "zod";

import { dashboardWidgetLayoutSchema } from "@/lib/dashboard-spec";
import { updateDashboardWidgetLayouts } from "@/lib/dashboard-store";
import { resolveUserScope } from "@/lib/user-scope";

export async function PATCH(request: Request) {
  const parsed = z.object({
    resourceId: z.string(),
    layouts: z.array(dashboardWidgetLayoutSchema).min(1).max(100),
  }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const scope = await resolveUserScope(request.headers, parsed.data.resourceId);
  if (!scope.ok) return scope.response;
  return Response.json(await updateDashboardWidgetLayouts(scope.scope.resourceId, parsed.data.layouts));
}
