import { describe, expect, test } from "bun:test";

import { montyTool } from "@/mastra/tools";
import { urlFetchTool } from "@/mastra/url-fetch-tool";

describe("internal tool catalog", () => {
  test("keeps stable IDs for mandatory runtime tools", () => {
    expect([montyTool.id, urlFetchTool.id]).toEqual([
      "monty",
      "url_fetch",
    ]);
  });
});
