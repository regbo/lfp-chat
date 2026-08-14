export const chartKinds = ["line", "bar"] as const;
export const chartUnits = ["currency", "number", "percent"] as const;

export type ChatChartSpec = {
  kind: "chart";
  chartType: (typeof chartKinds)[number];
  title: string;
  labels: string[];
  series: Array<{ name: string; values: Array<number | null> }>;
  unit: (typeof chartUnits)[number];
  currency?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
};

export function isChatChartSpec(value: unknown): value is ChatChartSpec {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ChatChartSpec>;
  if (
    record.kind !== "chart" ||
    !chartKinds.includes(record.chartType as ChatChartSpec["chartType"]) ||
    typeof record.title !== "string" ||
    !Array.isArray(record.labels) ||
    !Array.isArray(record.series) ||
    !chartUnits.includes(record.unit as ChatChartSpec["unit"])
  ) {
    return false;
  }
  return record.series.every(
    (item) =>
      item &&
      typeof item.name === "string" &&
      Array.isArray(item.values) &&
      item.values.length === record.labels?.length &&
      item.values.every((point) => point === null || Number.isFinite(point)),
  );
}
