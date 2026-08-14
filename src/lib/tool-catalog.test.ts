import { describe, expect, test } from "bun:test";

import {
  isMandatoryAgentToolId,
  migrateEnabledToolIds,
  orderToolsWithCodeModeLast,
} from "./tool-catalog";

describe("mandatory framework tools", () => {
  test("keeps internal runtimes and dashboard orchestration available", () => {
    expect(["monty", "cache", "code_interpreter", "dashboard_upsert_widget"].every(isMandatoryAgentToolId)).toBe(true);
    expect(isMandatoryAgentToolId("web_search")).toBe(false);
  });
});

describe("tool catalog migrations", () => {
  test("enables scheduling once for selections saved before catalog v2", () => {
    expect(migrateEnabledToolIds(["web_search"], 1)).toEqual([
      "web_search", "scheduling", "url_fetch", "notifications",
    ]);
  });

  test("adds dashboard capabilities once for selections saved before v4", () => {
    expect(migrateEnabledToolIds(["web_search"], 2)).toEqual(["web_search", "url_fetch", "notifications"]);
  });

  test("removes retired demos and hidden mandatory tools from saved selections", () => {
    expect(migrateEnabledToolIds(["calculator", "search", "monty", "cache", "dashboard", "code_interpreter", "url_fetch"], 5))
      .toEqual(["url_fetch", "notifications"]);
  });

  test("adds notifications once for selections saved before catalog v7", () => {
    expect(migrateEnabledToolIds(["web_search"], 6)).toEqual(["web_search", "notifications"]);
    expect(migrateEnabledToolIds(["web_search"], 7)).toEqual(["web_search"]);
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
