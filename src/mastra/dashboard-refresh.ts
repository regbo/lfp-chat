import { executeDashboardProgram } from "@/lib/dashboard-runtime";
import { refreshDashboardWidget } from "@/lib/dashboard-store";
import { ensureDashboardCapabilities } from "@/mastra/dashboard-capabilities";

export function runDashboardWidget(
  resourceId: string,
  widgetId: string,
  options: { force?: boolean } = {},
) {
  ensureDashboardCapabilities();
  return refreshDashboardWidget(resourceId, widgetId, executeDashboardProgram, options);
}
