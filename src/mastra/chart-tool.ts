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

const chartRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500).optional(),
  data: z
    .array(z.record(z.string().min(1).max(80), chartRowValueSchema))
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
  inputExamples: [
    {
      input: {
        title: "Monthly spending by merchant",
        description: "Compare Amazon and Target spending over time.",
        data: [
          { month: "Jan", Amazon: 120, Target: 60 },
          { month: "Feb", Amazon: 80, Target: 95 },
          { month: "Mar", Amazon: 145, Target: 40 },
        ],
        unit: "currency",
        currency: "USD",
      },
    },
  ],
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
    const prompt = [
      `Title: ${input.title}`,
      input.description ? `Intent: ${input.description}` : undefined,
      `Dataset (JSON, one row per object):\n${JSON.stringify(input.data)}`,
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
