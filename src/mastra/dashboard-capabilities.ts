import { serverConfig } from "@/lib/config";
import { registerDashboardMastraTools } from "@/lib/dashboard-runtime";
import { dashboardSqlTool, dashboardWebFetchTool } from "@/mastra/dashboard-source-tools";
import { montyTool } from "@/mastra/tools";
import { urlFetchTool } from "@/mastra/url-fetch-tool";
import { dashboardCacheTool } from "@/mastra/dashboard-cache-tool";

let registered = false;

/** Register the default read-oriented Mastra tools in this server process. */
export function ensureDashboardCapabilities() {
  if (registered) return;
  registerDashboardMastraTools({
    monty: montyTool,
    web_fetch: dashboardWebFetchTool,
    url_fetch: urlFetchTool,
    cache: dashboardCacheTool,
    ...(serverConfig.dashboard.sqlDatabaseUrl ? { sql_query: dashboardSqlTool } : {}),
  }, { overwrite: false });
  registered = true;
}
