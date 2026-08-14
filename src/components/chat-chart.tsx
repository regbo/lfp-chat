"use client";

import { BarChart, LineChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { init, use as registerECharts, type EChartsCoreOption } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

import type { ChatChartSpec } from "@/lib/chart-spec";

registerECharts([
  AriaComponent,
  BarChart,
  CanvasRenderer,
  GridComponent,
  LegendComponent,
  LineChart,
  TooltipComponent,
]);

function chartFormatter(spec: ChatChartSpec) {
  if (spec.unit === "currency") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: spec.currency ?? "USD",
      maximumFractionDigits: 0,
    });
  }
  return new Intl.NumberFormat(undefined, {
    style: spec.unit === "percent" ? "percent" : "decimal",
    maximumFractionDigits: 2,
  });
}

export function ChatChart({ spec }: { spec: ChatChartSpec }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const styles = getComputedStyle(container);
    const foreground = styles.getPropertyValue("--foreground").trim();
    const muted = styles.getPropertyValue("--muted-foreground").trim();
    const border = styles.getPropertyValue("--border").trim();
    const colors = [1, 2, 3, 4, 5].map((index) =>
      styles.getPropertyValue(`--chart-${index}`).trim(),
    );
    const formatter = chartFormatter(spec);
    const chart = init(container, undefined, { renderer: "canvas" });
    const option: EChartsCoreOption = {
      animationDuration: 350,
      aria: { enabled: true, decal: { show: true } },
      color: colors,
      grid: { left: 12, right: 12, top: 46, bottom: 24, containLabel: true },
      legend: { top: 8, textStyle: { color: muted } },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: unknown) =>
          typeof value === "number" ? formatter.format(value) : String(value ?? ""),
      },
      xAxis: {
        type: "category",
        data: spec.labels,
        name: spec.xAxisLabel,
        nameTextStyle: { color: muted },
        axisLabel: { color: muted },
        axisLine: { lineStyle: { color: border } },
      },
      yAxis: {
        type: "value",
        name: spec.yAxisLabel,
        nameTextStyle: { color: muted },
        axisLabel: { color: muted, formatter: (value: number) => formatter.format(value) },
        splitLine: { lineStyle: { color: border, opacity: 0.55 } },
      },
      series: spec.series.map((series) => ({
        name: series.name,
        type: spec.chartType,
        data: series.values,
        emphasis: { focus: "series" },
        ...(spec.chartType === "line"
          ? { connectNulls: false, smooth: 0.18, symbolSize: 7, lineStyle: { width: 2.5 } }
          : { barMaxWidth: 42 }),
      })),
      textStyle: { color: foreground, fontFamily: "inherit" },
    };
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [spec]);

  return (
    <figure className="not-prose my-3 overflow-hidden rounded-xl border border-border/70 bg-card/65 p-3">
      <figcaption className="mb-1 px-1 text-sm font-medium text-foreground">
        {spec.title}
      </figcaption>
      <div
        aria-label={spec.title}
        className="h-80 w-full"
        ref={containerRef}
        role="img"
      />
    </figure>
  );
}
