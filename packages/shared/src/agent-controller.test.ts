import { describe, expect, test } from "bun:test";

import { controllerToolCategory } from "./agent-controller";

describe("controllerToolCategory", () => {
  test.each([
    ["transaction_add", "edit"],
    ["task_create", "edit"],
    ["dashboard_archive", "edit"],
    ["apply_patch", "execute"],
    ["shell_command", "execute"],
    ["code_interpreter", "execute"],
    ["memory_recall", "read"],
    ["url_fetch", "read"],
    ["render_chart", "read"],
    ["submit_plan", "other"],
  ] as const)("classifies %s as %s", (toolName, expected) => {
    expect(controllerToolCategory(toolName)).toBe(expected);
  });
});
