import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  archiveDashboardTab,
  archiveDashboardWidget,
  deleteDashboardTab,
  deleteDashboardWidget,
  listDashboard,
  upsertDashboardWidget,
} from "@/lib/dashboard-store";
import {
  deleteDashboardUserTool,
  setDashboardUserToolArchived,
  upsertDashboardUserTool,
} from "@/lib/dashboard-user-tool-store";
import { dashboardUserToolDraftSchema, dashboardWidgetDraftSchema } from "@/lib/dashboard-spec";
import { executeDashboardUserTool } from "@/lib/dashboard-user-tool-runtime";
import { runDashboardWidget } from "@/mastra/dashboard-refresh";

function resourceId(context: { agent?: { resourceId?: string } }) {
  const value = context.agent?.resourceId;
  if (!value) throw new Error("Dashboard tools require a resource-scoped agent run.");
  return value;
}

export const dashboardUpsertWidgetTool = createTool({
  id: "dashboard_upsert_widget",
  description: `Create or update a dashboard presentation backed by exactly one saved user tool. Set toolName and the fixed JSON-compatible toolInput used on every dashboard load. Write Monty Python that receives data (the saved tool output), input (the fixed tool input), and now, then returns exactly one validated chart, metric, table, or text object. The optional widget css applies to the complete rendered output and defaults to Shadow DOM isolation; choose scoped isolation only when shadow rendering is unsuitable. Widgets do not cache, fetch, poll, or call tools; the saved tool owns all data access, composition, and caching. Use a stable widgetId when editing.`,
  inputSchema: dashboardWidgetDraftSchema.extend({ runNow: z.boolean().default(true) }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ runNow, ...draft }, context) => {
    const scope = resourceId(context);
    const saved = await upsertDashboardWidget(scope, draft);
    if (runNow) {
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

export const dashboardUpsertUserTool = createTool({
  id: "dashboard_upsert_tool",
  description: `Create or update a reusable deterministic dashboard tool. Write Monty Python that reads the JSON-compatible args variable and returns any JSON-compatible value. It also receives previous, the prior cached complete output for the same deeply stable input during refresh or TTL recomputation, or None on the first run. It may call declared built-in or user tools with await tool_call("tool_name", {input fields}); url_fetch and cache are available by default. The cache tool supports resource-scoped get, set, and soft-delete operations for intermediate values; get may explicitly include expired or deleted values. cacheTtlSeconds automatically caches the complete output for each deeply stable input with PostgreSQL advisory-lock protection. Tool calls may compose or recurse with changing inputs, bounded to six levels and 32 calls. Use a stable toolId when editing.`,
  inputSchema: dashboardUserToolDraftSchema.extend({
    testInput: z.unknown().optional(),
    runNow: z.boolean().default(true),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ runNow, testInput, ...draft }, context) => {
    const scope = resourceId(context);
    const tool = await upsertDashboardUserTool(scope, draft);
    if (!runNow) return { created: true, tool };
    return { created: true, tool, output: await executeDashboardUserTool(scope, tool.name, testInput ?? {}) };
  },
});

export const dashboardRunUserTool = createTool({
  id: "dashboard_run_tool",
  description: "Run a saved dashboard tool directly with JSON input. Cached results are reused according to the tool's TTL.",
  inputSchema: z.object({ name: z.string().min(1), input: z.unknown().default({}) }),
  outputSchema: z.unknown(),
  execute: async ({ name, input }, context) => executeDashboardUserTool(resourceId(context), name, input),
});

export const dashboardArchiveTool = createTool({
  id: "dashboard_archive",
  description: "Archive or restore a dashboard widget, tab, or reusable tool.",
  inputSchema: z.object({
    kind: z.enum(["widget", "tab", "tool"]),
    id: z.string().min(1),
    archived: z.boolean().default(true),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ archived, id, kind }, context) => {
    const scope = resourceId(context);
    if (kind === "widget") return archiveDashboardWidget(scope, id, archived);
    if (kind === "tab") return archiveDashboardTab(scope, id, archived);
    return setDashboardUserToolArchived(scope, id, archived);
  },
});

export const dashboardDeleteTool = createTool({
  id: "dashboard_delete",
  description: "Permanently delete an archived dashboard widget, tab, or reusable tool. Active items must be archived first.",
  inputSchema: z.object({ kind: z.enum(["widget", "tab", "tool"]), id: z.string().min(1) }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ id, kind }, context) => {
    const scope = resourceId(context);
    if (kind === "widget") return deleteDashboardWidget(scope, id);
    if (kind === "tab") return deleteDashboardTab(scope, id);
    return deleteDashboardUserTool(scope, id);
  },
});
