import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { chartKinds, chartUnits } from "@/lib/chart-spec";
import { resolveChartModel } from "@/mastra/model-provider";

const chartSeriesSchema = z.object({
  name: z.string().trim().min(1).max(80),
  values: z.array(z.number().finite().nullable()).min(1).max(240),
});

const chartPlanSchema = z.object({
  chartType: z.enum(chartKinds),
  title: z.string().trim().min(1).max(160).optional(),
  labels: z.array(z.string().max(80)).min(1).max(240),
  series: z.array(chartSeriesSchema).min(1).max(8),
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

const chartPlannerAgent = new Agent({
  id: "chartPlanner",
  name: "Chart planner",
  description: "Converts compact tabular data into a presentation-ready chart plan.",
  model: resolveChartModel(),
  instructions: `Turn the supplied JSON rows into a compact line or bar chart plan.

- Preserve the input row order unless chronological labels clearly need sorting.
- Use line for time trends and bar for discrete comparisons.
- Pick one categorical or time column for labels and numeric columns for series.
- Keep series names and axis labels concise and human-readable.
- Every series must contain exactly one value per label. Use null for missing values.
- Do not calculate, estimate, or invent values that are absent from the dataset.
- Return only the structured chart plan requested by the schema.`,
});

export const renderChartTool = createTool({
  id: "render_chart",
  description:
    "Render an interactive chart from compact tabular data already retrieved by another tool. A private local chart planner chooses the chart layout. Use for requests to show, plot, chart, trend, or compare numeric values.",
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
  execute: async (input, context) => {
    if (input.rows.some((row) => row.length !== input.columns.length)) {
      throw new Error("Every chart row must contain one value per column.");
    }
    const prompt = [
      `Title: ${input.title}`,
      input.description ? `Intent: ${input.description}` : undefined,
      `Columns: ${JSON.stringify(input.columns)}`,
      `Rows (JSON, aligned to columns):\n${JSON.stringify(input.rows)}`,
    ]
      .filter(Boolean)
      .join("\n");
    const timeout = AbortSignal.timeout(90_000);
    const abortSignal = context.abortSignal
      ? AbortSignal.any([context.abortSignal, timeout])
      : timeout;
    const response = await chartPlannerAgent.generate(prompt, {
      abortSignal,
      maxSteps: 1,
      modelSettings: { maxOutputTokens: 2_000, temperature: 0 },
      requestContext: context.requestContext,
      structuredOutput: {
        schema: chartPlanSchema,
        jsonPromptInjection: "auto",
      },
    });
    const plan = chartPlanSchema.parse(response.object);
    if (plan.series.some((series) => series.values.length !== plan.labels.length)) {
      throw new Error("The chart planner returned series that do not align with its labels.");
    }
    return {
      kind: "chart" as const,
      ...plan,
      title: plan.title || input.title,
      unit: input.unit,
      currency: input.currency?.toUpperCase(),
    };
  },
  toModelOutput: (output) => ({
    type: "text",
    value: `Rendered ${output.title} with ${output.series.length} series and ${output.labels.length} labels.`,
  }),
});
