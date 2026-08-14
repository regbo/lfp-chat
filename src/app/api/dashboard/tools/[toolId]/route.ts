import { z } from "zod";

import { deleteDashboardUserTool, setDashboardUserToolArchived } from "@/lib/dashboard-user-tool-store";
import { resolveUserScope } from "@/lib/user-scope";

async function scopeFor(request: Request) {
  const parsed = z.object({ resourceId: z.string(), archived: z.boolean().optional() }).safeParse(await request.json());
  if (!parsed.success) return { error: Response.json({ error: parsed.error.message }, { status: 400 }) };
  const scope = await resolveUserScope(request.headers, parsed.data.resourceId);
  if (!scope.ok) return { error: scope.response };
  return { data: parsed.data, resourceId: scope.scope.resourceId };
}

export async function PATCH(request: Request, context: { params: Promise<{ toolId: string }> }) {
  const scoped = await scopeFor(request);
  if (scoped.error) return scoped.error;
  if (scoped.data?.archived === undefined) return Response.json({ error: "archived is required" }, { status: 400 });
  const { toolId } = await context.params;
  return Response.json(await setDashboardUserToolArchived(scoped.resourceId!, toolId, scoped.data.archived));
}

export async function DELETE(request: Request, context: { params: Promise<{ toolId: string }> }) {
  const scoped = await scopeFor(request);
  if (scoped.error) return scoped.error;
  const { toolId } = await context.params;
  return Response.json(await deleteDashboardUserTool(scoped.resourceId!, toolId));
}
