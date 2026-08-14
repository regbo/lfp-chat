import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { chartRequestSchema } from "@/mastra/chart-tool";

describe("chart tool schema", () => {
  test("uses a strict provider-compatible table without fixed columns", () => {
    const schema = z.toJSONSchema(chartRequestSchema);
    const serialized = JSON.stringify(schema);

    expect(serialized).not.toContain("propertyNames");
    expect(Object.keys(schema.properties ?? {})).toEqual([
      "title",
      "description",
      "columns",
      "rows",
      "unit",
      "currency",
    ]);
  });
});
