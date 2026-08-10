"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Calculator,
  Clock3,
  Code2,
  Globe2,
  ImageIcon,
  Folder,
  LoaderCircle,
  Pause,
  Play,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

export type ThreadSummary = {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type BackgroundTaskSummary = {
  id: string;
  status: "pending" | "running" | "suspended" | "completed" | "failed" | "cancelled" | "timed_out";
  toolName: string;
  createdAt: string;
};

type ScheduleSummary = {
  id: string;
  name?: string;
  prompt: string;
  cron: string;
  timezone?: string;
  status: "active" | "paused";
  nextFireAt: number;
};

function PanelShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-12 pt-8 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-7">{children}</div>
      </div>
    </div>
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
            <p className="truncate text-sm font-medium">{thread.title || "New chat"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{thread.updatedAt ? new Date(thread.updatedAt).toLocaleString() : "Saved conversation"}</p>
          </button>
        ))}
        {results.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No matching chats.</p>}
      </div>
    </PanelShell>
  );
}

export function ProjectsPanel({ onNewChat }: { onNewChat: () => void }) {
  return (
    <PanelShell title="Projects" description="Keep project context and tools together.">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-4">
          <span className="grid size-11 place-items-center rounded-xl bg-muted"><Folder className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-medium">LFP Chat workspace</h2>
            <p className="mt-1 text-sm text-muted-foreground">Mastra server, Postgres memory, scheduled prompts, and isolated Monty code execution.</p>
            <Button className="mt-4 rounded-full" onClick={onNewChat}>New project chat</Button>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

function formatFireAt(value: number) {
  const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
  return new Date(milliseconds).toLocaleString();
}

export function SchedulesPanel({ resourceId, threadId }: { resourceId: string; threadId: string }) {
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
      const response = await fetch("/api/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, prompt, cron, timezone, resourceId, threadId }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to create schedule.");
      setName("");
      setPrompt("");
      await refresh();
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
          <p className="text-xs text-muted-foreground">Cron: minute hour day month weekday</p>
          <Button className="rounded-full" disabled={busy} type="submit">{busy && <LoaderCircle className="animate-spin" />} Create schedule</Button>
        </div>
      </form>
      {error && <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="mt-6 space-y-3">
        {schedules.map((schedule) => (
          <div className="rounded-2xl border p-4" key={schedule.id}>
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{schedule.name || schedule.prompt}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{schedule.prompt}</p>
                <p className="mt-2 text-xs text-muted-foreground">{schedule.cron} · {schedule.timezone || "UTC"} · Next {formatFireAt(schedule.nextFireAt)}</p>
              </div>
              <span className={cn("rounded-full px-2 py-1 text-xs", schedule.status === "active" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground")}>{schedule.status}</span>
            </div>
            <div className="mt-3 flex justify-end gap-1">
              <Button aria-label="Run now" disabled={busy} onClick={() => void act(schedule.id, "run")} size="icon-sm" variant="ghost"><Play /></Button>
              <Button aria-label={schedule.status === "active" ? "Pause" : "Resume"} disabled={busy} onClick={() => void act(schedule.id, schedule.status === "active" ? "pause" : "resume")} size="icon-sm" variant="ghost">{schedule.status === "active" ? <Pause /> : <Play />}</Button>
              <Button aria-label="Delete schedule" disabled={busy} onClick={() => void act(schedule.id, "delete")} size="icon-sm" variant="ghost"><Trash2 /></Button>
            </div>
          </div>
        ))}
        {schedules.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No schedules yet.</p>}
      </div>
    </PanelShell>
  );
}

const toolDetails = {
  search: { icon: Search, title: "Search", description: "Search built-in project knowledge." },
  calculator: { icon: Calculator, title: "Calculator", description: "Run reliable basic arithmetic." },
  monty: { icon: Code2, title: "Monty", description: "Execute Python in an isolated, resource-limited background worker." },
  web_search: { icon: Globe2, title: "Web search", description: "Search current information with OpenAI’s native web tool." },
  code_interpreter: { icon: Code2, title: "Code interpreter", description: "Analyze data and uploaded files in OpenAI’s hosted Python sandbox." },
  image_generation: { icon: ImageIcon, title: "Image generation", description: "Create images with OpenAI’s native image tool." },
};

export function ToolsPanel({ tasks }: { tasks: BackgroundTaskSummary[] }) {
  const active = tasks.filter((task) => ["pending", "running", "suspended"].includes(task.status));
  return (
    <PanelShell title="Tools" description="Functions available to the Mastra chat agent.">
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(toolDetails).map(([id, detail]) => {
          const Icon = detail.icon;
          return <div className="rounded-2xl border p-4" key={id}><Icon className="size-5" /><h2 className="mt-4 font-medium">{detail.title}</h2><p className="mt-1 text-sm text-muted-foreground">{detail.description}</p></div>;
        })}
      </div>
      <div className="mt-8 flex items-center gap-2"><Wrench className="size-4" /><h2 className="font-medium">Background activity</h2></div>
      <div className="mt-3 space-y-2">
        {tasks.slice(0, 10).map((task) => <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2 text-sm" key={task.id}>{["pending", "running"].includes(task.status) ? <LoaderCircle className="size-4 animate-spin" /> : <span className="size-4 rounded-full bg-emerald-500/70" />}<span className="flex-1 capitalize">{task.toolName}</span><span className="text-xs text-muted-foreground">{task.status}</span></div>)}
        {tasks.length === 0 && <p className="py-6 text-sm text-muted-foreground">No background executions yet. Ask the chat to run Python with Monty.</p>}
      </div>
      {active.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Results are written back into the same Postgres-backed conversation.</p>}
    </PanelShell>
  );
}
