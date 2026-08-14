import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { chartKinds, chartUnits } from "@/lib/chart-spec";

const chartSeriesSchema = z.object({
  name: z.string().trim().min(1).max(80),
  values: z.array(z.number().finite().nullable()).min(1).max(240),
});

const chartPlanSchema = z.object({
  chartType: z.enum(chartKinds),
  title: z.string().trim().min(1).max(160).optional(),
  labels: z.array(z.string().max(80)).min(1).max(240),
  series: z.array(chartSeriesSchema).min(1).max(15),
  xAxisLabel: z.string().trim().max(80).optional(),
  yAxisLabel: z.string().trim().max(80).optional(),
});

const chartRowValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const chartRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500).optional(),
  columns: z.array(z.string().trim().min(1).max(80)).min(2).max(16),
  rows: z
    .array(z.array(chartRowValueSchema).min(2).max(16))
    .min(1)
    .max(240),
  unit: z.enum(chartUnits).default("number"),
  currency: z.string().trim().length(3).optional(),
});

const chartOutputSchema = chartPlanSchema.extend({
  kind: z.literal("chart"),
  title: z.string().trim().min(1).max(160),
  unit: z.enum(chartUnits),
  currency: z.string().trim().length(3).optional(),
});

export type ChartRequest = z.infer<typeof chartRequestSchema>;

const temporalColumnPattern = /(^|\b)(date|day|week|month|quarter|year|time)(\b|$)/i;

function numericValue(value: z.infer<typeof chartRowValueSchema>) {
  if (value === null) return null;
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasTemporalAxis(column: string, labels: string[]) {
  if (temporalColumnPattern.test(column)) return true;
  const datedLabels = labels.filter((label) => {
    if (!/[a-z]|[-/:]/i.test(label)) return false;
    return Number.isFinite(Date.parse(label));
  });
  return datedLabels.length >= Math.ceil(labels.length * 0.6);
}

/** Convert the caller's aligned table directly into a chart without another model call. */
export function createChartSpec(input: ChartRequest) {
  if (input.rows.some((row) => row.length !== input.columns.length)) {
    throw new Error("Every chart row must contain one value per column.");
  }

  const labels = input.rows.map((row) => String(row[0] ?? ""));
  const series = input.columns.slice(1).flatMap((name, seriesIndex) => {
    const values = input.rows.map((row) => numericValue(row[seriesIndex + 1]));
    if (values.some((value) => value === undefined)) return [];
    if (!values.some((value) => typeof value === "number")) return [];
    return [{ name, values: values as Array<number | null> }];
  });

  if (series.length === 0) {
    throw new Error("Chart data must include at least one numeric series after the label column.");
  }

  return chartOutputSchema.parse({
    kind: "chart",
    chartType: hasTemporalAxis(input.columns[0], labels) ? "line" : "bar",
    title: input.title,
    labels,
    series,
    xAxisLabel: input.columns[0],
    unit: input.unit,
    currency: input.currency?.toUpperCase(),
  });
}

export const renderChartTool = createTool({
  id: "render_chart",
  description:
    "Render an interactive chart from compact tabular data already retrieved by another tool. The first column supplies ordered labels and each remaining numeric column becomes a series. Use for requests to show, plot, chart, trend, or compare numeric values.",
  strict: true,
  inputSchema: chartRequestSchema,
  outputSchema: chartOutputSchema,
  mcp: {
    annotations: {
      title: "Render chart",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async (input) => createChartSpec(input),
  toModelOutput: (output) => ({
    type: "text",
    value: `Rendered ${output.title} with ${output.series.length} series and ${output.labels.length} labels.`,
  }),
});
