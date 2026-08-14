"use client";

import { Archive, ArchiveRestore, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatChart } from "@/components/chat-chart";
import { Button } from "@/components/ui/button";
import type { CSSProperties } from "react";
import type { DashboardState, DashboardWidget } from "@/lib/dashboard-spec";
import { cn } from "@/lib/utils";

type DashboardView = "dashboard" | "archive";

function formatMetric(value: string | number | boolean | null) {
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  if (value === null) return "—";
  return String(value);
}

function updatedLabel(value?: string) {
  if (!value) return "Not loaded yet";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1_000));
  if (seconds < 5) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds}s ago`;
  return `Updated ${Math.floor(seconds / 60)}m ago`;
}

function WidgetContent({ widget }: { widget: DashboardWidget }) {
  const output = widget.output;
  if (!output) return <p className="text-sm text-muted-foreground">Load this widget to generate its first result.</p>;
  if (output.kind === "chart") return <ChatChart bare spec={output} />;
  if (output.kind === "metric") return <div><p className="text-3xl font-semibold tracking-tight">{formatMetric(output.value)}</p>{output.detail && <p className="mt-1 text-sm text-muted-foreground">{output.detail}</p>}</div>;
  if (output.kind === "text") {
    const weight = { normal: 400, medium: 500, semibold: 600, bold: 700 } as const;
    const style: CSSProperties = {
      fontWeight: output.css?.fontWeight ? weight[output.css.fontWeight] : undefined,
      fontStyle: output.css?.fontStyle,
      textAlign: output.css?.textAlign,
    };
    return <p className="whitespace-pre-wrap text-sm leading-6" style={style}>{output.text}</p>;
  }
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{output.columns.map((column) => <th className="border-b px-2 py-2 font-medium" key={column}>{column}</th>)}</tr></thead><tbody>{output.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td className="border-b border-border/50 px-2 py-2" key={cellIndex}>{formatMetric(cell)}</td>)}</tr>)}</tbody></table></div>;
}

export function DashboardPanel({ resourceId, onAvailabilityChange }: { resourceId: string; onAvailabilityChange?: (available: boolean) => void }) {
  const [state, setState] = useState<DashboardState>();
  const [view, setView] = useState<DashboardView>("dashboard");
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [activeTabId, setActiveTabId] = useState<string>();
  const loadAttempts = useRef(new Set<string>());

  const load = useCallback(async () => {
    const query = new URLSearchParams({ resourceId, includeArchived: "true" });
    const response = await fetch(`/api/dashboard?${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load the dashboard.");
    const next = await response.json() as DashboardState;
    setState(next);
    onAvailabilityChange?.(next.hasDashboard);
    if (!next.archivedItemCount) setView((current) => current === "archive" ? "dashboard" : current);
    return next;
  }, [onAvailabilityChange, resourceId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const activeTabs = useMemo(() => state?.tabs.filter((tab) => !tab.archivedAt) ?? [], [state]);
  const activeTab = activeTabs.find((tab) => tab.id === activeTabId) ?? activeTabs[0];
  const archivedWidgets = useMemo(() => state?.tabs.flatMap((tab) => tab.widgets).filter((widget) => widget.archivedAt) ?? [], [state]);

  const run = useCallback(async (widget: DashboardWidget, force = false) => {
    setRunning((value) => new Set(value).add(widget.id));
    try {
      await fetch(`/api/dashboard/widgets/${widget.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceId, force }) });
      await load();
    } finally {
      setRunning((value) => { const next = new Set(value); next.delete(widget.id); return next; });
    }
  }, [load, resourceId]);

  useEffect(() => {
    if (!activeTab || view !== "dashboard") return;
    for (const widget of activeTab.widgets) {
      if (widget.archivedAt || running.has(widget.id) || loadAttempts.current.has(widget.id)) continue;
      loadAttempts.current.add(widget.id);
      void run(widget);
    }
  }, [activeTab, run, running, view]);

  const mutate = async (path: string, method: "PATCH" | "DELETE", body: Record<string, unknown>) => {
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceId, ...body }) });
    if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Dashboard change failed.");
    await load();
  };
  const archiveWidget = (widget: DashboardWidget, archived: boolean) => mutate(`/api/dashboard/widgets/${widget.id}`, "PATCH", { archived });
  const permanentlyDelete = async (kind: "widgets" | "tools", id: string, title: string) => {
    if (!window.confirm(`Permanently delete “${title}”? This cannot be undone.`)) return;
    await mutate(`/api/dashboard/${kind}/${id}`, "DELETE", {});
  };

  if (!state) return <div className="flex flex-1 items-center justify-center"><LoaderCircle className="size-4 animate-spin" /></div>;
  return <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8"><div className="mx-auto max-w-6xl">
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        <button className={cn("rounded-lg px-3 py-1.5 text-sm", view === "dashboard" && "bg-background shadow-sm")} onClick={() => setView("dashboard")}>Dashboard</button>
        {state.archivedItemCount > 0 && <button className={cn("rounded-lg px-3 py-1.5 text-sm", view === "archive" && "bg-background shadow-sm")} onClick={() => setView("archive")}>Archive</button>}
      </div>
      {view === "dashboard" && activeTabs.length > 1 && <div className="flex gap-1">{activeTabs.map((tab) => <button className={cn("rounded-lg px-3 py-1.5 text-sm", activeTab?.id === tab.id && "bg-muted")} key={tab.id} onClick={() => setActiveTabId(tab.id)}>{tab.name}</button>)}</div>}
    </div>

    {view === "dashboard" && (!activeTab?.widgets.filter((widget) => !widget.archivedAt).length ? <p className="py-20 text-center text-sm text-muted-foreground">No active widgets. Ask the assistant to add one.</p> : <div className="grid gap-4 lg:grid-cols-2">{activeTab.widgets.filter((widget) => !widget.archivedAt).map((widget) => <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_8px_28px_rgba(0,0,0,0.045)]" key={widget.id}><header className="mb-3 flex items-start gap-2"><div className="min-w-0 flex-1"><h2 className="font-medium">{widget.title}</h2>{widget.description && <p className="mt-0.5 text-xs text-muted-foreground">{widget.description}</p>}<p className="mt-1 text-xs text-muted-foreground">{updatedLabel(widget.lastRunAt)} · {widget.toolName}</p></div><Button aria-label="Refresh widget" disabled={running.has(widget.id)} onClick={() => void run(widget, true)} size="icon-sm" variant="ghost">{running.has(widget.id) ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</Button><Button aria-label="Archive widget" onClick={() => void archiveWidget(widget, true)} size="icon-sm" variant="ghost"><Archive className="size-4" /></Button></header>{widget.lastError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{widget.lastError}</p> : <WidgetContent widget={widget} />}</section>)}</div>)}

    {view === "archive" && <div className="divide-y">{archivedWidgets.map((widget) => <div className="flex items-center gap-3 py-4" key={widget.id}><div className="min-w-0 flex-1"><p className="font-medium">{widget.title}</p><p className="text-sm text-muted-foreground">Widget</p></div><Button onClick={() => void archiveWidget(widget, false)} size="sm" variant="ghost"><ArchiveRestore className="size-4" /> Restore</Button><Button aria-label="Delete permanently" onClick={() => void permanentlyDelete("widgets", widget.id, widget.title)} size="icon-sm" variant="ghost"><Trash2 className="size-4" /></Button></div>)}</div>}
  </div></div>;
}
