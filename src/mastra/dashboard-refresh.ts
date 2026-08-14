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
    async (program) => {
      const data = await executeDashboardUserTool(
        resourceId,
        program.toolName,
        program.toolInput,
        undefined,
        { force: program.force },
      );
      return executeDashboardProgram({ code: program.code, data, toolInput: program.toolInput });
    },
    options,
  );
}
