import { describe, expect, test } from "bun:test";

import { isChatChartSpec } from "./chart-spec";

describe("chat chart specifications", () => {
  test("accepts aligned numeric series", () => {
    expect(
      isChatChartSpec({
        kind: "chart",
        chartType: "line",
        title: "Monthly spend",
        labels: ["Jan", "Feb"],
        series: [{ name: "Amazon", values: [12, 34] }],
        unit: "currency",
        currency: "USD",
      }),
    ).toBe(true);
  });

  test("rejects a series that does not align with the labels", () => {
    expect(
      isChatChartSpec({
        kind: "chart",
        chartType: "bar",
        title: "Monthly spend",
        labels: ["Jan", "Feb"],
        series: [{ name: "Target", values: [12] }],
        unit: "currency",
      }),
    ).toBe(false);
  });
});
