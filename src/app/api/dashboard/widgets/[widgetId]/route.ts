import { z } from "zod";

import { archiveDashboardWidget, deleteDashboardWidget, updateDashboardWidgetCss, updateDashboardWidgetMetadata } from "@/lib/dashboard-store";
import { resolveUserScope } from "@/lib/user-scope";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ widgetId: string }> },
) {
  const parsed = z.object({
    resourceId: z.string(),
    archived: z.boolean().optional(),
    title: z.string().max(160).optional(),
    description: z.string().max(500).optional(),
    css: z.string().max(20_000).optional(),
  }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const scope = await resolveUserScope(request.headers, parsed.data.resourceId);
  if (!scope.ok) return scope.response;
  const { widgetId } = await context.params;
  if (parsed.data.archived !== undefined) {
    return Response.json(await archiveDashboardWidget(scope.scope.resourceId, widgetId, parsed.data.archived));
  }
  if (parsed.data.css !== undefined) {
    return Response.json(await updateDashboardWidgetCss(scope.scope.resourceId, widgetId, parsed.data.css));
  }
  if (parsed.data.title === undefined && parsed.data.description === undefined) {
    return Response.json({ error: "A metadata field is required." }, { status: 400 });
  }
  return Response.json(await updateDashboardWidgetMetadata(scope.scope.resourceId, widgetId, {
    title: parsed.data.title ?? "",
    description: parsed.data.description ?? "",
  }));
}

export async function DELETE(request: Request, context: { params: Promise<{ widgetId: string }> }) {
  const parsed = z.object({ resourceId: z.string() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const scope = await resolveUserScope(request.headers, parsed.data.resourceId);
  if (!scope.ok) return scope.response;
  const { widgetId } = await context.params;
  return Response.json(await deleteDashboardWidget(scope.scope.resourceId, widgetId));
}
