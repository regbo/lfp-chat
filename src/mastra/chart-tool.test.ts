import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { chartRequestSchema, createChartSpec } from "@/mastra/chart-tool";

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

describe("deterministic chart conversion", () => {
  test("renders time data with ten aligned series without another model", () => {
    const columns = ["Date", ...Array.from({ length: 10 }, (_, index) => `Merchant ${index + 1}`)];
    const rows = Array.from({ length: 52 }, (_, rowIndex) => [
      `2026-06-${String((rowIndex % 28) + 1).padStart(2, "0")}`,
      ...Array.from({ length: 10 }, (_, seriesIndex) => String(rowIndex + seriesIndex)),
    ]);

    const spec = createChartSpec({
      title: "Major merchants",
      columns,
      rows,
      unit: "currency",
      currency: "usd",
    });

    expect(spec.chartType).toBe("line");
    expect(spec.labels).toHaveLength(52);
    expect(spec.series).toHaveLength(10);
    expect(spec.series[9]?.values).toHaveLength(52);
    expect(spec.currency).toBe("USD");
  });

  test("uses bars for discrete labels and ignores nonnumeric columns", () => {
    const spec = createChartSpec({
      title: "Merchant totals",
      columns: ["Merchant", "Spend", "Note"],
      rows: [["Amazon", 100, "online"], ["Target", 50, "store"]],
      unit: "currency",
    });

    expect(spec.chartType).toBe("bar");
    expect(spec.series).toEqual([{ name: "Spend", values: [100, 50] }]);
  });

  test("rejects tables without a numeric series", () => {
    expect(() => createChartSpec({
      title: "Invalid",
      columns: ["Merchant", "Note"],
      rows: [["Amazon", "online"]],
      unit: "number",
    })).toThrow("numeric series");
  });
});
