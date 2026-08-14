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
    css: z.object({
      fontWeight: z.enum(["normal", "medium", "semibold", "bold"]).optional(),
      fontStyle: z.enum(["normal", "italic"]).optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
    }).optional(),
  }),
]);

export type DashboardWidgetOutput = z.infer<typeof dashboardWidgetOutputSchema>;

export const dashboardWidgetLayoutSchema = z.object({
  widgetId: z.string().uuid(),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(100_000),
  w: z.number().int().min(3).max(12),
  h: z.number().int().min(2).max(24),
}).refine((layout) => layout.x + layout.w <= 12, {
  message: "Widget layout must fit within the dashboard grid.",
});

export type DashboardWidgetLayout = z.infer<typeof dashboardWidgetLayoutSchema>;

export const dashboardWidgetDraftSchema = z.object({
  widgetId: z.string().trim().min(1).max(100).optional(),
  tabName: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
  toolName: dashboardCapabilitySchema,
  toolInput: z.json().default({}),
  code: z.string().trim().min(1).max(30_000),
  css: z.string().trim().max(20_000).optional(),
  cssIsolation: z.enum(["shadow", "scoped"]).optional(),
});

export type DashboardWidgetDraft = z.infer<typeof dashboardWidgetDraftSchema>;

export const dashboardUserToolDraftSchema = z.object({
  toolId: z.string().trim().min(1).max(100).optional(),
  name: dashboardCapabilitySchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  code: z.string().trim().min(1).max(30_000),
  capabilities: z.array(dashboardCapabilitySchema).max(32).default(["url_fetch", "cache"]),
  cacheTtlSeconds: z.number().int().min(0).max(604_800).default(300),
});

export type DashboardUserToolDraft = z.infer<typeof dashboardUserToolDraftSchema>;

export type DashboardUserTool = DashboardUserToolDraft & {
  id: string;
  lastRunAt?: string;
  lastDurationMs?: number;
  lastError?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DashboardWidget = DashboardWidgetDraft & {
  id: string;
  tabId: string;
  position: number;
  layout: Omit<DashboardWidgetLayout, "widgetId">;
  output?: DashboardWidgetOutput;
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
  tools: DashboardUserTool[];
  archivedWidgetCount: number;
  archivedToolCount: number;
  archivedItemCount: number;
  hasDashboard: boolean;
};
