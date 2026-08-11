"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ModelSelection } from "@/lib/model-catalog";
import type { ThreadSummary } from "@/lib/thread-state";
import {
  toolCatalog,
  type SelectableToolId,
} from "@/lib/tool-catalog";
import {
  Calculator,
  Check,
  Clock3,
  Code2,
  Database,
  Globe2,
  ImageIcon,
  LoaderCircle,
  MessageSquare,
  Pause,
  Play,
  Search,
  Share2,
  ShieldAlert,
  Terminal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ScheduleSummary = {
  id: string;
  name?: string;
  prompt: string;
  cron: string;
  timezone?: string;
  status: "active" | "paused";
  nextFireAt: number;
  threadId?: string;
};

function PanelShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-12 pt-8 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="chat-display-text">{title}</h1>
        <p className="chat-ui-text mt-1 text-muted-foreground">{description}</p>
        <div className="mt-7">{children}</div>
      </div>
    </div>
  );
}

export function ArchivedPanel({
  threads,
  onOpen,
  renderActions,
}: {
  threads: ThreadSummary[];
  onOpen: (id: string) => void;
  renderActions: (thread: ThreadSummary) => React.ReactNode;
}) {
  return (
    <PanelShell title="Archived chats" description="Restore, rename, or permanently delete archived conversations.">
      <div className="space-y-1">
        {threads.map((thread) => (
          <div className="group flex items-center rounded-xl px-2 hover:bg-muted/55" key={thread.id}>
            <button className="min-w-0 flex-1 px-1 py-2.5 text-left" onClick={() => onOpen(thread.id)} type="button">
              <p className="chat-ui-text truncate font-medium">{thread.title || "New chat"}</p>
              <p className="chat-meta-text mt-0.5 text-muted-foreground">
                {thread.updatedAt ? new Date(thread.updatedAt).toLocaleString() : "Archived conversation"}
              </p>
            </button>
            {renderActions(thread)}
          </div>
        ))}
        {threads.length === 0 && <p className="chat-ui-text py-10 text-center text-muted-foreground">No archived chats.</p>}
      </div>
    </PanelShell>
  );
}

export function SearchPanel({ threads, onOpen }: { threads: ThreadSummary[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => threads.filter((thread) => (thread.title || "New chat").toLowerCase().includes(query.toLowerCase())),
    [query, threads],
  );
  return (
    <PanelShell title="Search chats" description="Find a conversation stored in Postgres memory.">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus className="h-11 rounded-xl pl-10" onChange={(event) => setQuery(event.target.value)} placeholder="Search by title" value={query} />
      </div>
      <div className="mt-4 space-y-1">
        {results.map((thread) => (
          <button className="w-full rounded-xl px-3 py-3 text-left hover:bg-muted" key={thread.id} onClick={() => onOpen(thread.id)} type="button">
            <p className="chat-ui-text truncate font-medium">{thread.title || "New chat"}</p>
            <p className="chat-meta-text mt-0.5 text-muted-foreground">{thread.updatedAt ? new Date(thread.updatedAt).toLocaleString() : "Saved conversation"}</p>
          </button>
        ))}
        {results.length === 0 && <p className="chat-ui-text py-10 text-center text-muted-foreground">No matching chats.</p>}
      </div>
    </PanelShell>
  );
}

function formatFireAt(value: number) {
  const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
  return new Date(milliseconds).toLocaleString();
}

export function SchedulesPanel({
  enabledToolIds,
  modelSelection,
  onConversationChange,
  onOpenConversation,
  resourceId,
}: {
  enabledToolIds: SelectableToolId[];
  modelSelection: ModelSelection | null;
  onConversationChange: () => void;
  onOpenConversation: (threadId: string) => void;
  resourceId: string;
}) {
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cron, setCron] = useState("0 9 * * 1-5");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/schedules?resourceId=${encodeURIComponent(resourceId)}`);
    const data = (await response.json()) as { schedules?: ScheduleSummary[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Unable to load schedules.");
    setSchedules(data.schedules || []);
  }, [resourceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh().catch((cause: Error) => setError(cause.message)), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, prompt, cron, timezone, resourceId, enabledToolIds, modelSelection }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to create schedule.");
      setName("");
      setPrompt("");
      await refresh();
      onConversationChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create schedule.");
    } finally { setBusy(false); }
  };

  const act = async (scheduleId: string, action: "pause" | "resume" | "run" | "delete") => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/schedules/${encodeURIComponent(scheduleId)}`, action === "delete" ? { method: "DELETE" } : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to update schedule.");
      await refresh();
      if (action === "run") {
        window.setTimeout(onConversationChange, 1_500);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update schedule."); }
    finally { setBusy(false); }
  };

  return (
    <PanelShell title="Scheduled" description="Run prompts on a cron schedule using Mastra’s persisted scheduler.">
      <form className="space-y-3 rounded-2xl border p-4" onSubmit={submit}>
        <Input onChange={(event) => setName(event.target.value)} placeholder="Name (optional)" value={name} />
        <Textarea className="min-h-24" onChange={(event) => setPrompt(event.target.value)} placeholder="What should LFP Chat do?" required value={prompt} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input aria-label="Cron expression" onChange={(event) => setCron(event.target.value)} required value={cron} />
          <Input aria-label="Timezone" onChange={(event) => setTimezone(event.target.value)} required value={timezone} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="chat-meta-text text-muted-foreground">Cron: minute hour day month weekday</p>
          <Button className="rounded-full" disabled={busy} type="submit">{busy && <LoaderCircle className="animate-spin" />} Create schedule</Button>
        </div>
      </form>
      {error && <p className="chat-ui-text mt-3 rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
      <div className="mt-6 space-y-3">
        {schedules.map((schedule) => (
          <div className="rounded-2xl border p-4" key={schedule.id}>
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{schedule.name || schedule.prompt}</p>
                <p className="chat-ui-text mt-1 line-clamp-2 text-muted-foreground">{schedule.prompt}</p>
                <p className="chat-meta-text mt-2 text-muted-foreground">{schedule.cron} · {schedule.timezone || "UTC"} · Next {formatFireAt(schedule.nextFireAt)}</p>
              </div>
              <span className={cn("chat-meta-text rounded-full px-2 py-1", schedule.status === "active" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground")}>{schedule.status}</span>
            </div>
            <div className="mt-3 flex justify-end gap-1">
              {schedule.threadId && (
                <Button className="mr-auto gap-1.5" disabled={busy} onClick={() => onOpenConversation(schedule.threadId!)} size="sm" variant="ghost"><MessageSquare className="size-4" /> Open conversation</Button>
              )}
              <Button aria-label="Run now" disabled={busy} onClick={() => void act(schedule.id, "run")} size="icon-sm" variant="ghost"><Play /></Button>
              <Button aria-label={schedule.status === "active" ? "Pause" : "Resume"} disabled={busy} onClick={() => void act(schedule.id, schedule.status === "active" ? "pause" : "resume")} size="icon-sm" variant="ghost">{schedule.status === "active" ? <Pause /> : <Play />}</Button>
              <Button aria-label="Delete schedule" disabled={busy} onClick={() => void act(schedule.id, "delete")} size="icon-sm" variant="ghost"><Trash2 /></Button>
            </div>
          </div>
        ))}
        {schedules.length === 0 && <p className="chat-ui-text py-8 text-center text-muted-foreground">No schedules yet.</p>}
      </div>
    </PanelShell>
  );
}

const toolIcons: Record<SelectableToolId, LucideIcon> = {
  search: Search,
  calculator: Calculator,
  monty: Code2,
  family_sql: Database,
  family_graph: Share2,
  web_search: Globe2,
  code_interpreter: Code2,
  image_generation: ImageIcon,
  code_mode: Terminal,
};

export function ToolsPanel({
  enabledToolIds,
  onToggle,
}: {
  enabledToolIds: SelectableToolId[];
  onToggle: (toolId: SelectableToolId) => void;
}) {
  return (
    <PanelShell title="Tools" description="Choose which capabilities are available to new chat runs and schedules.">
      <div className="space-y-2">
        {toolCatalog.map((detail) => {
          const Icon = toolIcons[detail.id];
          const enabled = enabledToolIds.includes(detail.id);
          return (
            <button
              aria-pressed={enabled}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-border/70 px-3 py-3 text-left transition-colors hover:bg-muted/55",
                enabled && "bg-muted/45",
              )}
              key={detail.id}
              onClick={() => onToggle(detail.id)}
              type="button"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background shadow-sm"><Icon className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="chat-ui-text flex items-center gap-2 font-medium">
                  {detail.title}
                  {"dangerous" in detail && detail.dangerous && <ShieldAlert className="size-3.5 text-amber-600" />}
                </span>
                <span className="chat-meta-text mt-0.5 block text-muted-foreground">{detail.description}</span>
              </span>
              <span className={cn("grid size-5 place-items-center rounded-full border", enabled ? "border-foreground bg-foreground text-background" : "border-border bg-background")}>
                {enabled && <Check className="size-3" />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="chat-meta-text mt-4 text-muted-foreground">Code mode is disabled by default. When enabled, its Mastra workspace can read and modify the host filesystem and execute local commands.</p>
    </PanelShell>
  );
}
