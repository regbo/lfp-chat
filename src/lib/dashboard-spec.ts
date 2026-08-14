import { z } from "zod";

export const dashboardCapabilitySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]{0,62}$/);
export type DashboardCapabilityName = z.infer<typeof dashboardCapabilitySchema>;

const dashboardScalarSchema = z.union([
  z.string().max(10_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const chartSeriesSchema = z.object({
  name: z.string().trim().min(1).max(80),
  values: z.array(z.number().finite().nullable()).min(1).max(240),
});

export const dashboardWidgetOutputSchema = z.union([
  z.object({
    kind: z.literal("chart"),
    chartType: z.enum(["line", "bar"]),
    title: z.string().trim().min(1).max(160),
    labels: z.array(z.string().max(80)).min(1).max(240),
    series: z.array(chartSeriesSchema).min(1).max(15),
    unit: z.enum(["currency", "number", "percent"]).default("number"),
    currency: z.string().trim().length(3).optional(),
    xAxisLabel: z.string().trim().max(80).optional(),
    yAxisLabel: z.string().trim().max(80).optional(),
  }).superRefine((value, context) => {
    value.series.forEach((series, index) => {
      if (series.values.length !== value.labels.length) {
        context.addIssue({
          code: "custom",
          message: "Chart series must contain one value per label.",
          path: ["series", index, "values"],
        });
      }
    });
  }),
  z.object({
    kind: z.literal("metric"),
    title: z.string().trim().min(1).max(160),
    value: dashboardScalarSchema,
    detail: z.string().trim().max(500).optional(),
    trend: z.enum(["up", "down", "flat"]).optional(),
  }),
  z.object({
    kind: z.literal("table"),
    title: z.string().trim().min(1).max(160),
    columns: z.array(z.string().trim().min(1).max(80)).min(1).max(16),
    rows: z.array(z.array(dashboardScalarSchema).max(16)).max(100),
  }).superRefine((value, context) => {
    value.rows.forEach((row, index) => {
      if (row.length !== value.columns.length) {
        context.addIssue({
          code: "custom",
          message: "Table rows must contain one value per column.",
          path: ["rows", index],
        });
      }
    });
  }),
  z.object({
    kind: z.literal("text"),
    title: z.string().trim().min(1).max(160),
    text: z.string().trim().min(1).max(20_000),
  }),
]);

export type DashboardWidgetOutput = z.infer<typeof dashboardWidgetOutputSchema>;

export const dashboardWidgetDraftSchema = z.object({
  widgetId: z.string().trim().min(1).max(100).optional(),
  tabName: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
  code: z.string().trim().min(1).max(30_000),
  capabilities: z.array(dashboardCapabilitySchema).max(32).default([]),
  cacheTtlSeconds: z.number().int().min(0).max(604_800).default(300),
  refreshIntervalSeconds: z.number().int().min(30).max(604_800).optional(),
  lazy: z.boolean().default(false),
});

export type DashboardWidgetDraft = z.infer<typeof dashboardWidgetDraftSchema>;

export type DashboardWidget = DashboardWidgetDraft & {
  id: string;
  tabId: string;
  position: number;
  output?: DashboardWidgetOutput;
  cacheExpiresAt?: string;
  lastRunAt?: string;
  lastDurationMs?: number;
  lastError?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DashboardTab = {
  id: string;
  name: string;
  position: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  widgets: DashboardWidget[];
};

export type DashboardState = {
  tabs: DashboardTab[];
  archivedWidgetCount: number;
  hasDashboard: boolean;
};
