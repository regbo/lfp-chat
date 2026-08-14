"use client";

import { Archive, ArchiveRestore, GripVertical, Info, LoaderCircle, Pencil, RefreshCw, Trash2 } from "lucide-react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ChatChart } from "@/components/chat-chart";
import { DashboardInputSummary } from "@/components/dashboard-input-summary";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { CSSProperties, KeyboardEvent } from "react";
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

const widgetShadowBaseCss = `
  :host { display: block; width: 100%; height: 100%; min-height: 0; color: var(--foreground); font-family: var(--font-ui-sans); }
  *, *::before, *::after { box-sizing: border-box; }
  .widget-output { width: 100%; height: 100%; min-height: 0; overflow: auto; }
  p, figure { margin: 0; }
  figure { display: flex; min-height: 0; height: 100%; flex-direction: column; overflow: hidden; }
  .chat-chart-canvas { width: 100%; height: 100%; min-height: 0; flex: 1; }
  table { width: 100%; border-collapse: collapse; text-align: left; font-size: var(--text-ui); }
  th, td { padding: .5rem; border-bottom: 1px solid var(--border); }
  th { font-weight: var(--weight-emphasis); }
`;

function ShadowWidgetContent({ children, css }: { children: React.ReactNode; css: string }) {
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot>();
  const attachHost = useCallback((host: HTMLDivElement | null) => {
    if (!host) return;
    setShadowRoot((current) => current ?? host.shadowRoot ?? host.attachShadow({ mode: "open" }));
  }, []);
  return <div className="h-full min-h-0 w-full" ref={attachHost}>{shadowRoot && createPortal(<><style>{widgetShadowBaseCss}{css}</style><div className="widget-output">{children}</div></>, shadowRoot)}</div>;
}

function StyledWidgetContent({ widget }: { widget: DashboardWidget }) {
  const content = <WidgetContent widget={widget} />;
  if (!widget.css) return content;
  if (widget.cssIsolation !== "scoped") return <ShadowWidgetContent css={widget.css}>{content}</ShadowWidgetContent>;
  return <><style>{`@scope (.dashboard-widget-user-content) {${widget.css}}`}</style><div className="dashboard-widget-user-content h-full min-h-0">{content}</div></>;
}

function EditableWidgetMetadata({
  onSave,
  widget,
}: {
  onSave: (title: string, description: string) => Promise<void>;
  widget: DashboardWidget;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(widget.title);
  const [description, setDescription] = useState(widget.description ?? "");

  const cancel = () => {
    setTitle(widget.title);
    setDescription(widget.description ?? "");
    setEditing(false);
  };
  const save = async () => {
    setEditing(false);
    const nextTitle = title.trim();
    const nextDescription = description.trim();
    if (nextTitle === widget.title && nextDescription === (widget.description ?? "")) return;
    await onSave(nextTitle, nextDescription);
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  if (editing) {
    return (
      <div
        className="min-w-0 flex-1 space-y-1"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) void save();
        }}
      >
        <input aria-label="Widget title" autoFocus className="w-full rounded-md bg-muted/60 px-2 py-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setTitle(event.target.value)} onKeyDown={keyDown} value={title} />
        <input aria-label="Widget description" className="w-full rounded-md bg-muted/60 px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setDescription(event.target.value)} onKeyDown={keyDown} value={description} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-start gap-1">
      <div className="min-w-0 flex-1">
        {widget.title && <button className="block max-w-full truncate text-left font-medium" onClick={() => setEditing(true)}>{widget.title}</button>}
        {widget.description && <button className="mt-0.5 block max-w-full truncate text-left text-xs text-muted-foreground" onClick={() => setEditing(true)}>{widget.description}</button>}
        <p className="mt-1 text-xs text-muted-foreground">{updatedLabel(widget.lastRunAt)} · {widget.toolName}</p>
      </div>
      <Button aria-label="Edit widget title and description" onClick={() => setEditing(true)} size="icon-sm" variant="ghost"><Pencil className="size-3.5" /></Button>
    </div>
  );
}

function WidgetCard({
  archiveWidget,
  running,
  run,
  updateCss,
  updateMetadata,
  widget,
  draggable = false,
}: {
  archiveWidget: (widget: DashboardWidget, archived: boolean) => Promise<void>;
  running: boolean;
  run: (widget: DashboardWidget, force?: boolean) => Promise<void>;
  updateCss: (widget: DashboardWidget, css: string) => Promise<void>;
  updateMetadata: (widget: DashboardWidget, title: string, description: string) => Promise<void>;
  widget: DashboardWidget;
  draggable?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [css, setCss] = useState(widget.css ?? "");
  const [savingCss, setSavingCss] = useState(false);
  const [cssError, setCssError] = useState("");

  const saveCss = async () => {
    setSavingCss(true);
    setCssError("");
    try {
      await updateCss(widget, css);
    } catch (error) {
      setCssError(error instanceof Error ? error.message : "Could not save widget CSS.");
    } finally {
      setSavingCss(false);
    }
  };

  return <section className="dashboard-widget flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-[0_8px_28px_rgba(0,0,0,0.045)]">
    <header className="mb-3 flex shrink-0 items-start gap-2">
      {draggable && <span aria-hidden="true" className="dashboard-widget-drag-handle mt-0.5 grid size-7 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing" title="Drag widget"><GripVertical className="size-4" /></span>}
      <EditableWidgetMetadata onSave={(title, description) => updateMetadata(widget, title, description)} widget={widget} />
      <Button aria-label={`Information about ${widget.title}`} onClick={() => { setCss(widget.css ?? ""); setDetailsOpen(true); }} size="icon-sm" variant="ghost"><Info className="size-4" /></Button>
      <Button aria-label="Refresh widget" disabled={running} onClick={() => void run(widget, true)} size="icon-sm" variant="ghost">{running ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</Button>
      <Button aria-label="Archive widget" onClick={() => void archiveWidget(widget, true)} size="icon-sm" variant="ghost"><Archive className="size-4" /></Button>
    </header>
    <div className={cn(
      "dashboard-widget-content min-h-0 flex-1 overflow-auto",
      widget.output?.kind === "chart" && "min-h-64 lg:min-h-0",
    )}>{widget.lastError ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{widget.lastError}</p> : <StyledWidgetContent widget={widget} />}</div>
    <Dialog onOpenChange={setDetailsOpen} open={detailsOpen}>
      <DialogContent className="min-w-0 sm:w-[min(46rem,calc(100vw-2rem))] sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{widget.title}</DialogTitle>
          <DialogDescription>How this widget gets its data and styles its output.</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-5">
          <DashboardInputSummary
            description="The source tool runs first. Fixed values are passed to it unchanged on every refresh."
            toolHref={(name) => `/tools#saved-tool-${name}`}
            toolNames={[widget.toolName]}
            value={widget.toolInput}
          />
          <div className="space-y-2">
            <div>
              <label className="chat-ui-text font-medium" htmlFor={`widget-css-${widget.id}`}>CSS</label>
              <p className="chat-meta-text text-muted-foreground">Applied only to this widget using {widget.cssIsolation === "scoped" ? "scoped" : "Shadow DOM"} isolation. Clear it to use the default styles.</p>
            </div>
            <Textarea
              className="min-h-48 resize-y font-mono text-xs leading-5"
              id={`widget-css-${widget.id}`}
              onChange={(event) => setCss(event.target.value)}
              placeholder={".widget-output {\n  /* Widget-only styles */\n}"}
              spellCheck={false}
              value={css}
            />
            {cssError && <p className="chat-meta-text text-destructive">{cssError}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setDetailsOpen(false)} variant="outline">Done</Button>
          <Button disabled={savingCss || css === (widget.css ?? "")} onClick={() => void saveCss()}>{savingCss && <LoaderCircle className="animate-spin" />}{savingCss ? "Saving" : "Save CSS"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

function DesktopWidgetGrid({
  archiveWidget,
  persistLayout,
  run,
  running,
  updateCss,
  updateMetadata,
  widgets,
}: {
  archiveWidget: (widget: DashboardWidget, archived: boolean) => Promise<void>;
  persistLayout: (layout: Layout) => Promise<void>;
  run: (widget: DashboardWidget, force?: boolean) => Promise<void>;
  running: Set<string>;
  updateCss: (widget: DashboardWidget, css: string) => Promise<void>;
  updateMetadata: (widget: DashboardWidget, title: string, description: string) => Promise<void>;
  widgets: DashboardWidget[];
}) {
  const { containerRef, mounted, width } = useContainerWidth({ measureBeforeMount: true });
  const sourceLayout = useMemo<Layout>(() => widgets.map((widget) => ({
    i: widget.id,
    ...widget.layout,
    minW: 3,
    minH: 3,
  })), [widgets]);
  const save = (next: Layout) => {
    void persistLayout(next);
  };

  return <div ref={containerRef}>{mounted && <ReactGridLayout
    className="dashboard-widget-grid"
    dragConfig={{ bounded: true, cancel: "button,input,textarea,[data-no-drag]", handle: ".dashboard-widget-drag-handle" }}
    gridConfig={{ cols: 12, rowHeight: 72, margin: [16, 16], containerPadding: [0, 0] }}
    layout={sourceLayout}
    onDragStop={(next) => save(next)}
    onResizeStop={(next) => save(next)}
    resizeConfig={{ enabled: true, handles: ["se"] }}
    width={width}
  >{widgets.map((widget) => <div key={widget.id}><WidgetCard archiveWidget={archiveWidget} draggable run={run} running={running.has(widget.id)} updateCss={updateCss} updateMetadata={updateMetadata} widget={widget} /></div>)}</ReactGridLayout>}</div>;
}

function useDesktopDashboard() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

export function DashboardPanel({ resourceId, onAvailabilityChange }: { resourceId: string; onAvailabilityChange?: (available: boolean) => void }) {
  const [state, setState] = useState<DashboardState>();
  const [view, setView] = useState<DashboardView>("dashboard");
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [activeTabId, setActiveTabId] = useState<string>();
  const loadAttempts = useRef(new Set<string>());
  const desktop = useDesktopDashboard();

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
  const activeWidgets = useMemo(() => activeTab?.widgets.filter((widget) => !widget.archivedAt) ?? [], [activeTab]);
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
  const updateWidgetMetadata = (widget: DashboardWidget, title: string, description: string) => mutate(`/api/dashboard/widgets/${widget.id}`, "PATCH", { title, description });
  const updateWidgetCss = (widget: DashboardWidget, css: string) => mutate(`/api/dashboard/widgets/${widget.id}`, "PATCH", { css });
  const persistLayout = async (layout: Layout) => {
    const response = await fetch("/api/dashboard/widgets/layout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceId,
        layouts: layout.map(({ i: widgetId, x, y, w, h }) => ({ widgetId, x, y, w, h })),
      }),
    });
    if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Could not save the dashboard layout.");
  };
  const permanentlyDelete = async (kind: "widgets" | "tools", id: string, title: string) => {
    if (!window.confirm(`Permanently delete “${title}”? This cannot be undone.`)) return;
    await mutate(`/api/dashboard/${kind}/${id}`, "DELETE", {});
  };

  if (!state) return <div className="flex flex-1 items-center justify-center"><LoaderCircle className="size-4 animate-spin" /></div>;
  return <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8"><div className="mx-auto max-w-6xl">
    <div className={cn("flex items-center justify-end gap-3", (state.archivedItemCount > 0 || activeTabs.length > 1) && "mb-5")}>
      {state.archivedItemCount > 0 && <div className="flex gap-1 rounded-xl bg-muted p-1">
        {view === "archive" && <button className="rounded-lg px-3 py-1.5 text-sm" onClick={() => setView("dashboard")}>Back</button>}
        <button className={cn("rounded-lg px-3 py-1.5 text-sm", view === "archive" && "bg-background shadow-sm")} onClick={() => setView("archive")}>Archive</button>
      </div>}
      {view === "dashboard" && activeTabs.length > 1 && <div className="flex gap-1">{activeTabs.map((tab) => <button className={cn("rounded-lg px-3 py-1.5 text-sm", activeTab?.id === tab.id && "bg-muted")} key={tab.id} onClick={() => setActiveTabId(tab.id)}>{tab.name}</button>)}</div>}
    </div>

    {view === "dashboard" && (!activeWidgets.length ? <p className="py-20 text-center text-sm text-muted-foreground">No active widgets. Ask the assistant to add one.</p> : desktop ? <DesktopWidgetGrid archiveWidget={archiveWidget} persistLayout={persistLayout} run={run} running={running} updateCss={updateWidgetCss} updateMetadata={updateWidgetMetadata} widgets={activeWidgets} /> : <div className="grid gap-4">{activeWidgets.map((widget) => <WidgetCard archiveWidget={archiveWidget} key={widget.id} run={run} running={running.has(widget.id)} updateCss={updateWidgetCss} updateMetadata={updateWidgetMetadata} widget={widget} />)}</div>)}

    {view === "archive" && <div className="divide-y">{archivedWidgets.map((widget) => <div className="flex items-center gap-3 py-4" key={widget.id}><div className="min-w-0 flex-1">{widget.title && <p className="font-medium">{widget.title}</p>}{widget.description && <p className="text-sm text-muted-foreground">{widget.description}</p>}{!widget.title && !widget.description && <p className="font-mono text-sm text-muted-foreground">{widget.toolName}</p>}</div><Button onClick={() => void archiveWidget(widget, false)} size="sm" variant="ghost"><ArchiveRestore className="size-4" /> Restore</Button><Button aria-label="Delete permanently" onClick={() => void permanentlyDelete("widgets", widget.id, widget.title || widget.toolName)} size="icon-sm" variant="ghost"><Trash2 className="size-4" /></Button></div>)}</div>}
  </div></div>;
}
