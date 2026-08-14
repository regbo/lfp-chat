import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  deleteDashboardNamedCache,
  getDashboardNamedCache,
  setDashboardNamedCache,
} from "@/lib/dashboard-user-tool-store";

export const dashboardCacheTool = createTool({
  id: "cache",
  description: "Read, write, or delete a resource-scoped PostgreSQL cache entry. Use namespaced keys. A saved tool's cacheTtlSeconds already caches its complete output; use this capability for intermediate or shared values.",
  inputSchema: z.object({
    operation: z.enum(["get", "set", "delete"]),
    key: z.string().trim().min(1).max(500),
    value: z.json().optional(),
    ttlSeconds: z.number().int().min(1).max(604_800).optional(),
  }),
  outputSchema: z.record(z.string(), z.unknown()),
  execute: async ({ key, operation, ttlSeconds, value }, context) => {
    const resourceId = context.agent?.resourceId;
    if (!resourceId) throw new Error("The cache tool requires a resource-scoped run.");
    if (operation === "get") return getDashboardNamedCache(resourceId, key);
    if (operation === "delete") return deleteDashboardNamedCache(resourceId, key);
    if (value === undefined || ttlSeconds === undefined) {
      throw new Error("cache set requires value and ttlSeconds.");
    }
    return setDashboardNamedCache(resourceId, key, value, ttlSeconds);
  },
});
