import { describe, expect, test } from "bun:test";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { executeDashboardProgram, registerDashboardMastraTools } from "./dashboard-runtime";

describe("dashboard Monty runtime", () => {
  test("adapts a real Mastra tool and returns validated widget data", async () => {
    registerDashboardMastraTools({
      test_sum: createTool({
        id: "test_sum",
        description: "Add two values.",
        inputSchema: z.object({ left: z.number(), right: z.number() }),
        outputSchema: z.object({ result: z.number() }),
        execute: async ({ left, right }) => ({ result: left + right }),
      }),
    });
    const result = await executeDashboardProgram({
      resourceId: "test-resource",
      capabilities: ["test_sum"],
      code: 'value = await tool_call("test_sum", {"left": 4, "right": 6})\n{"kind":"metric", "title":"Total", "value":value["result"]}',
    });
    expect(result.output).toEqual({ kind: "metric", title: "Total", value: 10 });
  });

  test("rejects tools omitted from the persisted allowlist", async () => {
    expect(executeDashboardProgram({
      resourceId: "test-resource",
      capabilities: [],
      code: 'await tool_call("test_sum", {"left": 1, "right": 2})',
    })).rejects.toThrow("did not declare");
  });
});
