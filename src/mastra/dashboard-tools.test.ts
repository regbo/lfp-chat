import { describe, expect, test } from "bun:test";

import type { DashboardState } from "@/lib/dashboard-spec";
import { dashboardListResult } from "@/mastra/dashboard-tools";

function dashboardState(): DashboardState {
  return {
    tabs: [{
      id: "tab-1",
      name: "Home",
      position: 0,
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
      widgets: [{
        id: "widget-1",
        tabId: "tab-1",
        title: "Balance",
        toolName: "balance_lookup",
        toolInput: { account: "checking" },
        code: "return {'kind': 'metric'}",
        css: ":host { color: green; }",
        position: 0,
        layout: { x: 0, y: 0, w: 6, h: 4 },
        output: { kind: "metric", title: "Balance", value: 42 },
        createdAt: "2026-08-15T00:00:00.000Z",
        updatedAt: "2026-08-15T00:00:00.000Z",
      }],
    }],
    tools: [{
      id: "tool-1",
      name: "balance_lookup",
      title: "Balance lookup",
      description: "Reads the current balance.",
      code: "return {'balance': 42}",
      capabilities: ["cache"],
      cacheTtlSeconds: 300,
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
    }],
    archivedWidgetCount: 0,
    archivedToolCount: 0,
    archivedItemCount: 0,
    hasDashboard: true,
  };
}

describe("dashboard list result", () => {
  test("omits definitions and cached output by default without mutating state", () => {
    const state = dashboardState();
    const result = dashboardListResult(state);
    const widget = result.tabs[0]?.widgets[0];

    expect(widget).not.toHaveProperty("code");
    expect(widget).not.toHaveProperty("css");
    expect(widget).not.toHaveProperty("toolInput");
    expect(widget).not.toHaveProperty("output");
    expect(result.tools[0]).not.toHaveProperty("code");
    expect(state.tabs[0]?.widgets[0]).toHaveProperty("output");
    expect(state.tools[0]).toHaveProperty("code");
  });

  test("includes definitions on demand but never cached output", () => {
    const result = dashboardListResult(dashboardState(), true);
    const widget = result.tabs[0]?.widgets[0];

    expect(widget).toMatchObject({
      code: "return {'kind': 'metric'}",
      css: ":host { color: green; }",
      toolInput: { account: "checking" },
    });
    expect(widget).not.toHaveProperty("output");
    expect(result.tools[0]).toHaveProperty("code", "return {'balance': 42}");
  });
});
