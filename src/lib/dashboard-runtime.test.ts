import { describe, expect, test } from "bun:test";

import { executeDashboardProgram } from "./dashboard-runtime";
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
