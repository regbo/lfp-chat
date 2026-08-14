import { z } from "zod";

import { archiveDashboardWidget, deleteDashboardWidget } from "@/lib/dashboard-store";
import { resolveUserScope } from "@/lib/user-scope";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ widgetId: string }> },
) {
  const parsed = z.object({ resourceId: z.string(), archived: z.boolean() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const scope = await resolveUserScope(request.headers, parsed.data.resourceId);
  if (!scope.ok) return scope.response;
  const { widgetId } = await context.params;
  return Response.json(await archiveDashboardWidget(scope.scope.resourceId, widgetId, parsed.data.archived));
}

export async function DELETE(request: Request, context: { params: Promise<{ widgetId: string }> }) {
  const parsed = z.object({ resourceId: z.string() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const scope = await resolveUserScope(request.headers, parsed.data.resourceId);
  if (!scope.ok) return scope.response;
  const { widgetId } = await context.params;
  return Response.json(await deleteDashboardWidget(scope.scope.resourceId, widgetId));
}
