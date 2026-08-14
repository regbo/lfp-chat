import { describe, expect, test } from "bun:test";

import {
  migrateEnabledToolIds,
  orderToolsWithCodeModeLast,
} from "./tool-catalog";

describe("tool catalog migrations", () => {
  test("enables scheduling once for selections saved before catalog v2", () => {
    expect(migrateEnabledToolIds(["web_search"], 1)).toEqual([
      "web_search", "scheduling", "url_fetch", "dashboard",
    ]);
  });

  test("adds dashboard capabilities once for selections saved before v4", () => {
    expect(migrateEnabledToolIds(["web_search"], 2)).toEqual(["web_search", "url_fetch", "dashboard"]);
  });

  test("removes retired demos and hidden mandatory tools from saved selections", () => {
    expect(migrateEnabledToolIds(["calculator", "search", "monty", "cache", "url_fetch"], 5))
      .toEqual(["url_fetch"]);
  });
});

describe("tool catalog ordering", () => {
  test("keeps host code mode last after contributed tools", () => {
    expect(orderToolsWithCodeModeLast([
      { id: "url_fetch" },
      { id: "code_mode" },
      { id: "render_chart" },
    ])).toEqual([
      { id: "url_fetch" },
      { id: "render_chart" },
      { id: "code_mode" },
    ]);
  });
});
