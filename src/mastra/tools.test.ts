import { describe, expect, test } from "bun:test";

import { calculatorTool, montyTool, searchTool } from "@/mastra/tools";
import { urlFetchTool } from "@/mastra/url-fetch-tool";

describe("generic tool catalog", () => {
  test("keeps stable IDs for dashboard adaptation", () => {
    expect([searchTool.id, calculatorTool.id, montyTool.id, urlFetchTool.id]).toEqual([
      "search",
      "calculator",
      "monty",
      "url_fetch",
    ]);
  });
});
