import { executeDashboardProgram } from "@/lib/dashboard-runtime";
import { refreshDashboardWidget } from "@/lib/dashboard-store";
import { ensureDashboardCapabilities } from "@/mastra/dashboard-capabilities";
import { executeDashboardUserTool } from "@/lib/dashboard-user-tool-runtime";

export function runDashboardWidget(
  resourceId: string,
  widgetId: string,
  options: { force?: boolean } = {},
) {
  ensureDashboardCapabilities();
  return refreshDashboardWidget(
    resourceId,
    widgetId,
    (program) => executeDashboardProgram({
      ...program,
      userToolCall: (id, input, budget) => executeDashboardUserTool(resourceId, id, input, budget, { force: program.force }),
    }),
    options,
  );
}
