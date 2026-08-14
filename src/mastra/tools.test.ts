import { describe, expect, test } from "bun:test";

import { dashboardCacheTool } from "@/mastra/dashboard-cache-tool";
import { montyTool } from "@/mastra/tools";
import { urlFetchTool } from "@/mastra/url-fetch-tool";

describe("internal tool catalog", () => {
  test("keeps stable IDs for mandatory runtime tools", () => {
    expect([montyTool.id, dashboardCacheTool.id, urlFetchTool.id]).toEqual([
      "monty",
      "cache",
      "url_fetch",
    ]);
  });
});
