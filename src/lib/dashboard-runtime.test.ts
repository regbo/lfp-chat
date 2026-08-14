import { describe, expect, test } from "bun:test";

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  callRegisteredDashboardTool,
  executeDashboardProgram,
  registerDashboardMastraTools,
} from "./dashboard-runtime";
import { dashboardWidgetDraftSchema, dashboardWidgetLayoutSchema } from "./dashboard-spec";
import { dashboardToolCacheKey } from "./dashboard-user-tool-store";

describe("dashboard presentation runtime", () => {
  test("presents one saved tool result without tool access", async () => {
    const result = await executeDashboardProgram({
      data: { quote: "Hello" },
      toolInput: { category: "plain" },
      code: '{"kind":"text", "title":"Quote", "text":data["quote"], "css":{"fontWeight":"bold"}}',
    });
    expect(result.output).toEqual({
      kind: "text",
      title: "Quote",
      text: "Hello",
      css: { fontWeight: "bold" },
    });
  });

  test("rejects presentation output outside the display schema", async () => {
    expect(executeDashboardProgram({
      data: {},
      toolInput: {},
      code: '{"kind":"html", "html":"<script>bad()</script>"}',
    })).rejects.toThrow();
  });
});

describe("dashboard capability registry", () => {
  test("uses Mastra's public-schema adapter for Zod transforms", async () => {
    const tool = createTool({
      id: "typed_dashboard_lookup",
      description: "Validate and transform a typed dashboard lookup.",
      inputSchema: z.object({ value: z.string().transform(Number) }),
      outputSchema: z.object({ value: z.number() }),
      execute: async ({ value }) => ({ value }),
    });
    registerDashboardMastraTools({ typed_dashboard_lookup: tool });

    await expect(callRegisteredDashboardTool(
      "typed_dashboard_lookup",
      { value: "17" },
      "test-resource",
    )).resolves.toEqual({ found: true, value: { value: 17 } });
  });

  test("keeps configured tools when the compatibility registry initializes", async () => {
    const configured = createTool({
      id: "configured_dashboard_lookup",
      description: "Consumer-configured implementation.",
      inputSchema: z.object({}),
      execute: async () => ({ source: "configured" }),
    });
    const fallback = createTool({
      id: "configured_dashboard_lookup",
      description: "Compatibility fallback.",
      inputSchema: z.object({}),
      execute: async () => ({ source: "fallback" }),
    });
    registerDashboardMastraTools({ configured_dashboard_lookup: configured });
    registerDashboardMastraTools(
      { configured_dashboard_lookup: fallback },
      { overwrite: false },
    );

    await expect(callRegisteredDashboardTool(
      "configured_dashboard_lookup",
      {},
      "test-resource",
    )).resolves.toEqual({ found: true, value: { source: "configured" } });
  });
});

describe("dashboard tool cache keys", () => {
  test("deeply nested object order does not change the key", () => {
    const left = { filters: { merchant: "Amazon", range: { end: 2, start: 1 } }, groups: [{ z: 3, a: 1 }] };
    const right = { groups: [{ a: 1, z: 3 }], filters: { range: { start: 1, end: 2 }, merchant: "Amazon" } };
    expect(dashboardToolCacheKey(left)).toBe(dashboardToolCacheKey(right));
  });

  test("different nested inputs produce different keys", () => {
    expect(dashboardToolCacheKey({ filters: { merchant: "Amazon" } }))
      .not.toBe(dashboardToolCacheKey({ filters: { merchant: "Target" } }));
  });
});

describe("dashboard widget layouts", () => {
  test("accepts a widget that fits in the twelve-column grid", () => {
    expect(dashboardWidgetLayoutSchema.parse({
      widgetId: "0c4cb628-5453-4fa9-82f1-761a133f3e17",
      x: 6,
      y: 4,
      w: 6,
      h: 4,
    })).toMatchObject({ x: 6, y: 4, w: 6, h: 4 });
  });

  test("rejects a widget that extends beyond the grid", () => {
    expect(() => dashboardWidgetLayoutSchema.parse({
      widgetId: "0c4cb628-5453-4fa9-82f1-761a133f3e17",
      x: 8,
      y: 0,
      w: 6,
      h: 4,
    })).toThrow("Widget layout must fit within the dashboard grid");
  });
});

describe("dashboard widget styling", () => {
  test("accepts isolated per-widget CSS", () => {
    const widget = dashboardWidgetDraftSchema.parse({
      title: "Styled quote",
      toolName: "quote_fetch",
      toolInput: {},
      code: '{"kind":"text","title":"Quote","text":str(data)}',
      css: "p { font-weight: 700; }",
      cssIsolation: "shadow",
    });
    expect(widget).toMatchObject({
      css: "p { font-weight: 700; }",
      cssIsolation: "shadow",
    });
  });
});
