import { createTool, webFetchTool } from "@mastra/core/tools";
import { z } from "zod";

import { executeDashboardSql } from "@/lib/dashboard-sql";

export const dashboardSqlTool = createTool({
  id: "sql_query",
  description:
    "Run one read-only SELECT against the optional host-configured dashboard PostgreSQL source. The host must provide DASHBOARD_SQL_DATABASE_URL and a schema description.",
  inputSchema: z.object({ sql: z.string().min(1).max(10_000) }),
  outputSchema: z.object({ columns: z.array(z.string()), rows: z.array(z.record(z.string(), z.unknown())), rowCount: z.number(), truncated: z.boolean() }),
  execute: async ({ sql }) => executeDashboardSql(sql),
});

export { webFetchTool as dashboardWebFetchTool };
