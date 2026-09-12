import { describe, expect, test } from "bun:test";

import {
  windmillDigestionSearchTool,
  windmillDigestionSearchInputSchema,
  windmillFinanceSearchInputSchema,
  windmillFinanceSearchTool,
  windmillStatusTool,
} from "@/host/windmill-tool";

describe("Windmill Home tools", () => {
  test("publish stable native tool identifiers", () => {
    expect(windmillStatusTool.id).toBe("windmill_status");
    expect(windmillDigestionSearchTool.id).toBe("windmill_digestion_search");
    expect(windmillFinanceSearchTool.id).toBe("windmill_finance_search");
  });

  test("bounds digestion search inputs", () => {
    expect(windmillDigestionSearchInputSchema.parse({})).toEqual({
      search: "",
      lane: "all",
      cursor_at: "",
      cursor_id: "",
      page_size: 40,
    });
    expect(() => windmillDigestionSearchInputSchema.parse({ page_size: 101 }))
      .toThrow();
  });

  test("bounds finance output search inputs", () => {
    expect(windmillFinanceSearchInputSchema.parse({})).toEqual({
      query: "",
      offset: 0,
      limit: 50,
    });
    expect(() => windmillFinanceSearchInputSchema.parse({ limit: 101 }))
      .toThrow();
  });
});
