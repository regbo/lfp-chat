import { describe, expect, test } from "bun:test";

import {
  migrateEnabledToolIds,
  orderToolsWithCodeModeLast,
} from "./tool-catalog";

describe("tool catalog migrations", () => {
  test("enables scheduling once for selections saved before catalog v2", () => {
    expect(migrateEnabledToolIds(["search"], 1)).toEqual(["search", "scheduling"]);
  });

  test("preserves an explicit v2 scheduling choice", () => {
    expect(migrateEnabledToolIds(["search"], 2)).toEqual(["search"]);
  });

  test("migrates the deployment-specific task capability name", () => {
    expect(migrateEnabledToolIds(["family_tasks"], 2)).toEqual(["tasks"]);
  });
});

describe("tool catalog ordering", () => {
  test("keeps host code mode last after contributed tools", () => {
    expect(orderToolsWithCodeModeLast([
      { id: "search" },
      { id: "code_mode" },
      { id: "render_chart" },
    ])).toEqual([
      { id: "search" },
      { id: "render_chart" },
      { id: "code_mode" },
    ]);
  });
});
