import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  archiveDashboardTab,
  archiveDashboardWidget,
  listDashboard,
  upsertDashboardWidget,
} from "@/lib/dashboard-store";
import { dashboardWidgetDraftSchema } from "@/lib/dashboard-spec";
import { runDashboardWidget } from "@/mastra/dashboard-refresh";

function resourceId(context: { agent?: { resourceId?: string } }) {
  const value = context.agent?.resourceId;
  if (!value) throw new Error("Dashboard tools require a resource-scoped agent run.");
  return value;
}

export const dashboardUpsertWidgetTool = createTool({
  id: "dashboard_upsert_widget",
  description: `Create or update a persisted dashboard widget. Write Monty Python that returns exactly one object with kind chart, metric, table, or text. Call an allowed Mastra tool with await tool_call("tool_id", {input fields}). The program receives now, cache_get(), and cache_age_seconds(). Declare every tool ID it calls in capabilities. cacheTtlSeconds controls reuse on page load; it does not enable polling. Set refreshIntervalSeconds only when the user explicitly requests automatic background refresh. Use a stable widgetId when editing.`,
  inputSchema: dashboardWidgetDraftSchema.extend({ runNow: z.boolean().default(true) }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ runNow, ...draft }, context) => {
    const scope = resourceId(context);
    const saved = await upsertDashboardWidget(scope, draft);
    if (runNow && !draft.lazy) {
      const refreshed = await runDashboardWidget(scope, saved.widget.id, { force: true });
      return { ...saved, widget: refreshed.widget, cacheHit: refreshed.cacheHit };
    }
    return saved;
  },
});

export const dashboardListTool = createTool({
  id: "dashboard_list",
  description: "List the current user's dashboard tabs, widget IDs, programs, cache state, and archives.",
  inputSchema: z.object({ includeArchived: z.boolean().default(false) }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ includeArchived }, context) =>
    listDashboard(resourceId(context), { includeArchived }),
});

export const dashboardArchiveTool = createTool({
  id: "dashboard_archive",
  description: "Archive or restore a dashboard widget or an entire tab.",
  inputSchema: z.object({
    kind: z.enum(["widget", "tab"]),
    id: z.string().min(1),
    archived: z.boolean().default(true),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ archived, id, kind }, context) => {
    const scope = resourceId(context);
    return kind === "widget"
      ? archiveDashboardWidget(scope, id, archived)
      : archiveDashboardTab(scope, id, archived);
  },
});
