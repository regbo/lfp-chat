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

export function ChatChart({ spec, bare = false }: { spec: ChatChartSpec; bare?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const formatter = chartFormatter(spec);
    const chart = init(container, undefined, {
      renderer: "canvas",
      // ECharts can under-invalidate line segments during axis-tooltip hover.
      // A full canvas repaint keeps every series intact as the pointer moves.
      useDirtyRect: false,
    });
    const render = () => {
      const styles = getComputedStyle(container);
      const foreground = styles.getPropertyValue("--foreground").trim();
      const muted = styles.getPropertyValue("--muted-foreground").trim();
      const border = styles.getPropertyValue("--border").trim();
      const card = styles.getPropertyValue("--card").trim();
      const colors = Array.from({ length: 10 }, (_, index) => index + 1).map((index) =>
        styles.getPropertyValue(`--chart-${index}`).trim(),
      );
      const option: EChartsCoreOption = {
        animation: false,
        aria: { enabled: true, decal: { show: false } },
        color: colors,
        grid: { left: 12, right: 16, top: 48, bottom: 38, containLabel: true },
        legend: {
          type: "scroll",
          top: 8,
          left: 24,
          right: 24,
          itemGap: 18,
          textStyle: { color: muted, fontWeight: 500 },
        },
        tooltip: {
          trigger: "axis",
          axisPointer: { animation: false, type: "line" },
          backgroundColor: card,
          borderColor: border,
          textStyle: { color: foreground },
          valueFormatter: (value: unknown) =>
            typeof value === "number" ? formatter.format(value) : String(value ?? ""),
        },
        xAxis: {
          type: "category",
          data: spec.labels,
          name: spec.xAxisLabel,
          nameLocation: "middle",
          nameGap: 30,
          nameTextStyle: { color: muted },
          axisLabel: { color: muted, hideOverlap: true },
          axisLine: { lineStyle: { color: border } },
          axisTick: { lineStyle: { color: border } },
        },
        yAxis: {
          type: "value",
          name: spec.yAxisLabel,
          nameTextStyle: { color: muted },
          axisLabel: { color: muted, formatter: (value: number) => formatter.format(value) },
          splitLine: { lineStyle: { color: border, opacity: 0.72 } },
        },
        series: spec.series.map((series) => ({
          name: series.name,
          type: spec.chartType,
          data: series.values,
          // Tooltips remain interactive without changing or obscuring a series.
          emphasis: { disabled: true },
          ...(spec.chartType === "line"
            ? {
                connectNulls: false,
                smooth: 0.12,
                showSymbol: spec.labels.length <= 24,
                symbolSize: 6,
                lineStyle: { width: 2.5 },
              }
            : { barMaxWidth: 42, itemStyle: { borderRadius: [4, 4, 0, 0] } }),
        })),
        textStyle: { color: foreground, fontFamily: "inherit" },
      };
      chart.setOption(option, { notMerge: true });
    };
    render();

    let resizeFrame = 0;
    let width = container.clientWidth;
    let height = container.clientHeight;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry?.contentRect.width ?? container.clientWidth;
      const nextHeight = entry?.contentRect.height ?? container.clientHeight;
      if (Math.abs(nextWidth - width) < 1 && Math.abs(nextHeight - height) < 1) return;
      width = nextWidth;
      height = nextHeight;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => chart.resize({ animation: { duration: 0 } }));
    });
    observer.observe(container);
    const themeObserver = new MutationObserver(render);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => {
      cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      themeObserver.disconnect();
      chart.dispose();
    };
  }, [spec]);

  return (
    <figure className={bare ? "not-prose overflow-hidden" : "chat-chart-shell not-prose my-3 overflow-hidden rounded-2xl border p-3.5"}>
      {!bare && <figcaption className="mb-1 px-1 text-sm font-medium text-foreground">
        {spec.title}
      </figcaption>}
      <div
        aria-label={spec.title}
        className="chat-chart-canvas h-80 w-full"
        ref={containerRef}
        role="img"
      />
    </figure>
  );
}
