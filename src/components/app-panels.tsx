"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import { cleanTaskTitle } from "@/lib/task-metadata";
import type { Task, TaskList } from "@/lib/tasks";
import {
  DEFAULT_CHAT_AGENT_ID,
  formatReasoningEffort,
  type ModelCatalogResponse,
  type ModelSelection,
} from "@/lib/model-catalog";
import type { ThreadSummary } from "@/lib/thread-state";
import {
  toolCatalog,
  type SelectableToolId,
} from "@/lib/tool-catalog";
import type { ChatAppToolContribution } from "@/lib/chat-app-plugins";
import {
  Calculator,
  Bell,
  Blocks,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  Globe2,
  ImageIcon,
  LoaderCircle,
  ListTodo,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ScheduleSummary = {
  id: string;
  agentId: string;
  name?: string;
  prompt: string;
  cron: string;
  timezone?: string;
  status: "active" | "paused";
  nextFireAt: number;
  lastFireAt?: number;
  threadId?: string;
  modelSelection?: ModelSelection;
};

type ScheduleRun = {
  id?: string;
  runId: string | null;
  actualFireAt: number;
  scheduledFireAt: number;
  outcome: "published" | "succeeded" | "delivered" | "persisted" | "discarded" | "skipped" | "aborted" | "failed";
  triggerKind?: "schedule-fire" | "queue-drain" | "manual";
  error?: string;
  output?: string;
  completedAt?: number;
};

type ScheduleDraft = Pick<ScheduleSummary, "name" | "prompt" | "cron" | "timezone"> & {
  modelSelection: ModelSelection | null;
};

function PanelShell({
  action,
  title,
  description,
  children,
}: {
  action?: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-12 pt-8 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="chat-display-text">{title}</h1>
            <p className="chat-ui-text mt-1 text-muted-foreground">{description}</p>
          </div>
          {action}
        </div>
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
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [taskResults, setTaskResults] = useState<Task[]>([]);
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [taskSearchLoading, setTaskSearchLoading] = useState(false);
  const [taskSearchError, setTaskSearchError] = useState("");

  const typedTags = useMemo(
    () => Array.from(query.matchAll(/(?:^|\s)#([^\s#]+)/g), (match) => match[1]!).filter(Boolean),
    [query],
  );
  const textQuery = useMemo(() => query.replace(/(?:^|\s)#[^\s#]+/g, " ").trim(), [query]);
  const activeTags = useMemo(
    () => Array.from(new Map([...selectedTags, ...typedTags].map((tag) => [tag.toLocaleLowerCase(), tag])).values()),
    [selectedTags, typedTags],
  );
  const conversationResults = useMemo(
    () => threads.filter((thread) => (thread.title || "New chat").toLocaleLowerCase().includes(textQuery.toLocaleLowerCase())),
    [textQuery, threads],
  );
  const availableTags = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const task of allTasks) {
      for (const tag of cleanTaskTitle(task.title, task.tags).tags) {
        const key = tag.toLocaleLowerCase();
        const current = counts.get(key);
        counts.set(key, { label: current?.label ?? tag, count: (current?.count ?? 0) + 1 });
      }
    }
    return Array.from(counts.values()).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }, [allTasks]);
  const listNames = useMemo(() => new Map(taskLists.map((list) => [list.id, list.name])), [taskLists]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/tasks?allLists=true", { cache: "no-store", signal: controller.signal }),
      fetch("/api/task-lists", { cache: "no-store", signal: controller.signal }),
    ]).then(async ([tasksResponse, listsResponse]) => {
      if (!tasksResponse.ok || !listsResponse.ok) throw new Error("Could not load searchable tasks.");
      const [tasksPayload, listsPayload] = await Promise.all([
        tasksResponse.json() as Promise<{ tasks?: Task[] }>,
        listsResponse.json() as Promise<{ lists?: TaskList[] }>,
      ]);
      setAllTasks(tasksPayload.tasks ?? []);
      setTaskLists(listsPayload.lists ?? []);
    }).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setTaskSearchError(cause instanceof Error ? cause.message : "Could not load searchable tasks.");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!textQuery && activeTags.length === 0) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ allLists: "true" });
      if (textQuery) params.set("search", textQuery);
      for (const tag of activeTags) params.append("tag", tag);
      setTaskSearchLoading(true);
      setTaskSearchError("");
      void fetch(`/api/tasks?${params}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json() as { tasks?: Task[]; error?: string };
          if (!response.ok) throw new Error(payload.error || "Could not search tasks.");
          setTaskResults(payload.tasks ?? []);
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setTaskSearchError(cause instanceof Error ? cause.message : "Could not search tasks.");
        })
        .finally(() => { if (!controller.signal.aborted) setTaskSearchLoading(false); });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [activeTags, textQuery]);

  function toggleTag(tag: string) {
    setSelectedTags((current) => current.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())
      ? current.filter((item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase())
      : [...current, tag]);
  }

  const searching = Boolean(textQuery || activeTags.length);
  const visibleTaskResults = searching ? taskResults : [];
  return (
    <PanelShell title="Search" description="Find conversations and tasks, or narrow tasks with #tags.">
      <div className="relative">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search conversations and tasks" autoComplete="off" className="h-11 rounded-xl pl-10" name="universal-search" onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, notes, or #tags…" value={query} />
      </div>
      {availableTags.length > 0 && <div aria-label="Filter tasks by tag" className="mt-3 flex flex-wrap gap-2">{availableTags.slice(0, 10).map(({ label, count }) => {
        const active = activeTags.some((tag) => tag.toLocaleLowerCase() === label.toLocaleLowerCase());
        return <button aria-pressed={active} className={cn("task-search-tag", active && "task-search-tag-active")} key={label} onClick={() => toggleTag(label)} type="button">#{label}<span>{count}</span>{active && <X aria-hidden="true" />}</button>;
      })}</div>}

      <div className="mt-7 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="search-conversations-heading">
          <div className="flex items-center gap-2"><MessageSquare aria-hidden="true" className="size-4 text-muted-foreground" /><h2 className="chat-ui-emphasis" id="search-conversations-heading">Conversations</h2><span className="chat-meta-text text-muted-foreground">{conversationResults.length}</span></div>
          <div className="mt-2 space-y-1">
            {conversationResults.map((thread) => (
              <button className="w-full rounded-xl px-3 py-3 text-left hover:bg-muted" key={thread.id} onClick={() => onOpen(thread.id)} type="button">
                <p className="chat-ui-text truncate font-medium">{thread.title || "New chat"}</p>
                <p className="chat-meta-text mt-0.5 text-muted-foreground">{thread.updatedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(thread.updatedAt)) : "Saved conversation"}</p>
              </button>
            ))}
            {conversationResults.length === 0 && <p className="chat-ui-text py-8 text-center text-muted-foreground">No matching conversations.</p>}
          </div>
        </section>

        <section aria-labelledby="search-tasks-heading">
          <div className="flex items-center gap-2"><ListTodo aria-hidden="true" className="size-4 text-muted-foreground" /><h2 className="chat-ui-emphasis" id="search-tasks-heading">Tasks</h2>{searching && !taskSearchLoading && <span className="chat-meta-text text-muted-foreground">{visibleTaskResults.length}</span>}{searching && taskSearchLoading && <LoaderCircle aria-label="Searching tasks" className="size-3.5 animate-spin text-muted-foreground" />}</div>
          <div className="mt-2 space-y-1" aria-live="polite">
            {visibleTaskResults.map((task) => {
              const cleaned = cleanTaskTitle(task.title, task.tags);
              return <Link className="block rounded-xl px-3 py-3 hover:bg-muted" href={{ pathname: "/tasks", query: { list: task.listId, task: task.id } }} key={task.id}>
                <p className="chat-ui-text break-words font-medium">{cleaned.title}</p>
                {task.description && <p className="chat-meta-text mt-1 line-clamp-2 text-muted-foreground">{task.description}</p>}
                <div className="chat-meta-text mt-2 flex flex-wrap items-center gap-2 text-muted-foreground"><span>{listNames.get(task.listId) ?? "Task list"}</span>{cleaned.tags.map((tag) => <span className="task-tag" key={tag}>#{tag}</span>)}</div>
              </Link>;
            })}
            {!searching && <p className="chat-ui-text py-8 text-center text-muted-foreground">Search task titles and notes, or choose a tag.</p>}
            {searching && !taskSearchLoading && visibleTaskResults.length === 0 && !taskSearchError && <p className="chat-ui-text py-8 text-center text-muted-foreground">No matching tasks.</p>}
            {taskSearchError && <p className="chat-ui-text py-6 text-center text-destructive" role="alert">{taskSearchError}</p>}
          </div>
        </section>
      </div>
    </PanelShell>
  );
}

function formatFireAt(value: number) {
  const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
  return new Date(milliseconds).toLocaleString();
}

function scheduleDraft(
  schedule: ScheduleSummary,
  fallbackModelSelection: ModelSelection | null,
): ScheduleDraft {
  return {
    name: schedule.name || "",
    prompt: schedule.prompt,
    cron: schedule.cron,
    timezone: schedule.timezone || "UTC",
    modelSelection: schedule.modelSelection ?? fallbackModelSelection,
  };
}

function modelSelectionLabel(
  catalog: ModelCatalogResponse | null,
  selection: ModelSelection | null | undefined,
) {
  if (!catalog || !selection) return "Inherited model";
  const agent = catalog.agents.find((candidate) => candidate.id === selection.agentId);
  if (agent) return agent.label;
  const model = catalog.models.find((candidate) => candidate.id === selection.modelId);
  return [model?.label || selection.modelId, formatReasoningEffort(selection.reasoningEffort)]
    .filter(Boolean)
    .join(" · ");
}

function ModelSelectionFields({
  catalog,
  modelLabel = "Job model",
  onChange,
  selection,
}: {
  catalog: ModelCatalogResponse | null;
  modelLabel?: string;
  onChange: (selection: ModelSelection) => void;
  selection: ModelSelection | null;
}) {
  if (!catalog || !selection) return null;
  const selectedModel = catalog.models.find(
    (candidate) => candidate.id === selection.modelId,
  );
  const targetValue =
    selection.agentId === DEFAULT_CHAT_AGENT_ID
      ? `model:${selection.modelId}`
      : `agent:${selection.agentId}`;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <label className="chat-ui-text font-medium">{modelLabel}</label>
        <Select
          onValueChange={(value) => {
            if (!value) return;
            if (value.startsWith("agent:")) {
              onChange({
                agentId: value.slice(6),
                modelId: selection.modelId,
                reasoningEffort: null,
              });
              return;
            }
            const model = catalog.models.find(
              (candidate) => candidate.id === value.slice(6),
            );
            if (!model) return;
            onChange({
              agentId: DEFAULT_CHAT_AGENT_ID,
              modelId: model.id,
              reasoningEffort: model.defaultReasoningEffort,
            });
          }}
          value={targetValue}
        >
          <SelectTrigger aria-label="Job model" className="w-full">
            <SelectValue>{modelSelectionLabel(catalog, selection)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {catalog.agents.length > 0 && (
              <SelectGroup>
                <SelectLabel>Agents</SelectLabel>
                {catalog.agents.map((agent) => (
                  <SelectItem key={agent.id} value={`agent:${agent.id}`}>
                    {agent.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            <SelectGroup>
              <SelectLabel>Models</SelectLabel>
              {catalog.models.map((model) => (
                <SelectItem key={model.id} value={`model:${model.id}`}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {selection.agentId === DEFAULT_CHAT_AGENT_ID &&
        selectedModel &&
        selectedModel.reasoningEfforts.length > 0 && (
          <div className="space-y-1.5">
            <label className="chat-ui-text font-medium">Reasoning</label>
            <Select
              onValueChange={(value) => {
                if (!value) return;
                onChange({
                  ...selection,
                  reasoningEffort: value as ModelSelection["reasoningEffort"],
                });
              }}
              value={selection.reasoningEffort || selectedModel.defaultReasoningEffort || "none"}
            >
              <SelectTrigger aria-label="Job reasoning" className="w-full">
                <SelectValue>
                  {formatReasoningEffort(
                    selection.reasoningEffort || selectedModel.defaultReasoningEffort,
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {selectedModel.reasoningEfforts.map((effort) => (
                  <SelectItem key={effort} value={effort}>
                    {formatReasoningEffort(effort)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
    </div>
  );
}

function runTone(outcome: ScheduleRun["outcome"]) {
  if (["succeeded", "delivered", "persisted"].includes(outcome)) {
    return "bg-emerald-500/10 text-emerald-700";
  }
  if (["failed", "aborted"].includes(outcome)) {
    return "bg-destructive/10 text-destructive";
  }
  return "bg-muted text-muted-foreground";
}

export function SchedulesPanel({
  enabledToolIds,
  modelCatalog,
  modelSelection,
  onConversationChange,
  onOpenConversation,
  resourceId,
}: {
  enabledToolIds: string[];
  modelCatalog: ModelCatalogResponse | null;
  modelSelection: ModelSelection | null;
  onConversationChange: () => void;
  onOpenConversation: (threadId: string) => void;
  resourceId: string;
}) {
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState("Every weekday at 9:00 AM");
  const [runImmediately, setRunImmediately] = useState(true);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [createModelSelection, setCreateModelSelection] = useState<ModelSelection | null>(modelSelection);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runState, setRunState] = useState<{
    scheduleId: string;
    loading: boolean;
    runs: ScheduleRun[];
    error?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/schedules?resourceId=${encodeURIComponent(resourceId)}`);
    const data = (await response.json()) as {
      schedules?: ScheduleSummary[];
      runImmediatelyDefault?: boolean;
      error?: string;
    };
    if (!response.ok) throw new Error(data.error || "Unable to load schedules.");
    setSchedules(data.schedules || []);
    if (typeof data.runImmediatelyDefault === "boolean" && !createOpen) {
      setRunImmediately(data.runImmediatelyDefault);
    }
  }, [createOpen, resourceId]);

  const loadRuns = useCallback(async (scheduleId: string) => {
    setRunState((current) => ({
      scheduleId,
      loading: true,
      runs: current?.scheduleId === scheduleId ? current.runs : [],
    }));
    try {
      const response = await fetch(
        `/api/schedules/${encodeURIComponent(scheduleId)}/runs?resourceId=${encodeURIComponent(resourceId)}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as { runs?: ScheduleRun[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load run history.");
      setRunState({ scheduleId, loading: false, runs: data.runs || [] });
    } catch (cause) {
      setRunState({
        scheduleId,
        loading: false,
        runs: [],
        error: cause instanceof Error ? cause.message : "Unable to load run history.",
      });
    }
  }, [resourceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh().catch((cause: Error) => setError(cause.message)), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setCreateError("");
    setNotice("");
    try {
      const response = await fetch("/api/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, prompt, schedule, timezone, resourceId, enabledToolIds, modelSelection: createModelSelection ?? modelSelection, runImmediately }) });
      const data = (await response.json()) as { error?: string; existing?: boolean; schedule?: ScheduleSummary; initialRunStarted?: boolean; initialRunWarning?: string };
      if (!response.ok) throw new Error(data.error || "Unable to create schedule.");
      if (data.existing) {
        setNotice(`“${data.schedule?.name || "Existing schedule"}” already covers this work. Edit that schedule instead.`);
      } else {
        setName("");
        setPrompt("");
        setSchedule("Every weekday at 9:00 AM");
        setNotice(data.initialRunWarning ? `Schedule created, but its first run could not start: ${data.initialRunWarning}` : data.initialRunStarted ? "Schedule created and its first run started." : "Schedule created.");
      }
      setCreateOpen(false);
      await refresh();
      onConversationChange();
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "Unable to create schedule.");
    } finally { setBusy(false); }
  };

  const act = async (scheduleId: string, action: "pause" | "resume" | "run" | "delete") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action === "delete" && !window.confirm("Delete this schedule and its run conversation?")) return;
      const response = await fetch(
        `/api/schedules/${encodeURIComponent(scheduleId)}${action === "delete" ? `?resourceId=${encodeURIComponent(resourceId)}` : ""}`,
        action === "delete"
          ? { method: "DELETE" }
          : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, resourceId }) },
      );
      const data = (await response.json()) as { error?: string; result?: { claimId?: string } };
      if (!response.ok) throw new Error(data.error || "Unable to update schedule.");
      await refresh();
      if (action === "run") {
        setNotice("Run started. History will update when it finishes.");
        window.setTimeout(onConversationChange, 1_500);
        window.setTimeout(() => void loadRuns(scheduleId), 2_000);
        window.setTimeout(() => void loadRuns(scheduleId), 7_000);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update schedule."); }
    finally { setBusy(false); }
  };

  const save = async (event: FormEvent, scheduleId: string) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/schedules/${encodeURIComponent(scheduleId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          resourceId,
          name: draft.name,
          prompt: draft.prompt,
          schedule: draft.cron,
          timezone: draft.timezone,
          modelSelection: draft.modelSelection,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to save schedule.");
      setEditingId(null);
      setDraft(null);
      setNotice("Schedule updated.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save schedule.");
    } finally {
      setBusy(false);
    }
  };

  const toggleHistory = (scheduleId: string) => {
    if (expandedId === scheduleId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(scheduleId);
    void loadRuns(scheduleId);
  };

  return (
    <PanelShell
      action={(
        <Button className="shrink-0 rounded-full" onClick={() => { setCreateError(""); setCreateModelSelection(modelSelection); setCreateOpen(true); }}>
          <Plus className="size-4" /> New schedule
        </Button>
      )}
      title="Scheduled"
      description="Configure recurring agent work and inspect every run and output."
    >
      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <form className="space-y-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New schedule</DialogTitle>
              <DialogDescription>Describe the recurring job, then choose when it should run.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input aria-label="Schedule name" onChange={(event) => setName(event.target.value)} placeholder="Name (optional)" value={name} />
              <Textarea aria-label="Schedule prompt" className="min-h-24" onChange={(event) => setPrompt(event.target.value)} placeholder="What should LFP Chat do?" required value={prompt} />
            </div>
            <div className="space-y-1.5">
              <label className="chat-ui-text font-medium" htmlFor="new-schedule-cadence">Schedule</label>
              <Input
                id="new-schedule-cadence"
                onChange={(event) => setSchedule(event.target.value)}
                placeholder="Every Tuesday at 9 AM or 0 9 * * 2"
                required
                value={schedule}
              />
              <p className="chat-meta-text text-muted-foreground">Use plain language or a standard cron expression.</p>
            </div>
            <label className="chat-ui-text flex cursor-pointer items-start gap-3 rounded-xl border p-3">
              <input
                checked={runImmediately}
                className="mt-0.5 size-4 accent-foreground"
                onChange={(event) => setRunImmediately(event.target.checked)}
                type="checkbox"
              />
              <span><span className="block font-medium">Run once now</span><span className="chat-meta-text mt-0.5 block text-muted-foreground">Start the first run immediately, then continue on schedule.</span></span>
            </label>
            <div className="space-y-1.5">
              <label className="chat-ui-text font-medium" htmlFor="new-schedule-timezone">Timezone</label>
              <Input id="new-schedule-timezone" onChange={(event) => setTimezone(event.target.value)} required value={timezone} />
            </div>
            <ModelSelectionFields
              catalog={modelCatalog}
              onChange={setCreateModelSelection}
              selection={createModelSelection}
            />
            {createError && <p className="chat-ui-text rounded-xl bg-destructive/10 p-3 text-destructive">{createError}</p>}
            <DialogFooter className="mt-2">
              <Button disabled={busy} onClick={() => setCreateOpen(false)} type="button" variant="ghost">Cancel</Button>
              <Button disabled={busy} type="submit">{busy && <LoaderCircle className="animate-spin" />} Create schedule</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {error && <p className="chat-ui-text mt-3 rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
      {notice && <p className="chat-ui-text mt-3 rounded-xl bg-muted p-3 text-foreground">{notice}</p>}
      <div className="mt-6 space-y-3">
        {schedules.map((schedule) => (
          <div className="rounded-2xl border p-4" key={schedule.id}>
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{schedule.name || schedule.prompt}</p>
                <p className="chat-ui-text mt-1 line-clamp-2 text-muted-foreground">{schedule.prompt}</p>
                <p className="chat-meta-text mt-2 text-muted-foreground">{schedule.cron} · {schedule.timezone || "UTC"} · {modelSelectionLabel(modelCatalog, schedule.modelSelection)} · Next {formatFireAt(schedule.nextFireAt)}</p>
              </div>
              <span className={cn("chat-meta-text rounded-full px-2 py-1", schedule.status === "active" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground")}>{schedule.status}</span>
            </div>
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1 border-t pt-2 sm:border-0 sm:pt-0">
              {schedule.threadId && (
                <Button className="min-w-0 basis-full justify-start gap-1.5 sm:mr-auto sm:basis-auto" disabled={busy} onClick={() => onOpenConversation(schedule.threadId!)} size="sm" variant="ghost"><MessageSquare className="size-4" /> <span className="truncate">Open conversation</span></Button>
              )}
              <Button className="gap-1.5" disabled={busy} onClick={() => toggleHistory(schedule.id)} size="sm" variant="ghost">
                <ChevronDown className={cn("size-4 transition-transform", expandedId === schedule.id && "rotate-180")} /> History
              </Button>
              <Button aria-label="Edit schedule" disabled={busy} onClick={() => { setEditingId(schedule.id); setDraft(scheduleDraft(schedule, modelSelection)); }} size="icon-sm" variant="ghost"><Pencil /></Button>
              <Button aria-label="Run now" disabled={busy} onClick={() => void act(schedule.id, "run")} size="icon-sm" variant="ghost"><Play /></Button>
              <Button aria-label={schedule.status === "active" ? "Pause" : "Resume"} disabled={busy} onClick={() => void act(schedule.id, schedule.status === "active" ? "pause" : "resume")} size="icon-sm" variant="ghost">{schedule.status === "active" ? <Pause /> : <Play />}</Button>
              <Button aria-label="Delete schedule" disabled={busy} onClick={() => void act(schedule.id, "delete")} size="icon-sm" variant="ghost"><Trash2 /></Button>
            </div>
            {editingId === schedule.id && draft && (
              <form className="mt-4 space-y-3 border-t pt-4" onSubmit={(event) => void save(event, schedule.id)}>
                <Input aria-label="Schedule name" onChange={(event) => setDraft({ ...draft, name: event.target.value })} required value={draft.name} />
                <Textarea aria-label="Schedule prompt" className="min-h-24" onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} required value={draft.prompt} />
                <div className="space-y-1.5">
                  <label className="chat-ui-text font-medium" htmlFor={`schedule-cadence-${schedule.id}`}>Schedule</label>
                  <Input id={`schedule-cadence-${schedule.id}`} onChange={(event) => setDraft({ ...draft, cron: event.target.value })} placeholder="Every Tuesday at 9 AM or 0 9 * * 2" required value={draft.cron} />
                  <p className="chat-meta-text text-muted-foreground">Use plain language or a standard cron expression.</p>
                </div>
                <Input aria-label="Schedule timezone" onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} required value={draft.timezone} />
                <ModelSelectionFields
                  catalog={modelCatalog}
                  onChange={(selection) => setDraft({ ...draft, modelSelection: selection })}
                  selection={draft.modelSelection}
                />
                <div className="flex justify-end gap-2">
                  <Button disabled={busy} onClick={() => { setEditingId(null); setDraft(null); }} type="button" variant="ghost">Cancel</Button>
                  <Button disabled={busy} type="submit">Save changes</Button>
                </div>
              </form>
            )}
            {expandedId === schedule.id && (
              <div className="mt-4 border-t pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="chat-ui-emphasis">Run history</p>
                  <Button aria-label="Refresh run history" disabled={runState?.loading} onClick={() => void loadRuns(schedule.id)} size="icon-sm" variant="ghost">
                    <RefreshCw className={cn(runState?.loading && "animate-spin")} />
                  </Button>
                </div>
                {runState?.scheduleId === schedule.id && runState.error && (
                  <p className="chat-ui-text mt-3 text-destructive">{runState.error}</p>
                )}
                {runState?.scheduleId === schedule.id && !runState.loading && runState.runs.length === 0 && (
                  <p className="chat-ui-text py-6 text-center text-muted-foreground">No runs yet.</p>
                )}
                <div className="mt-2 space-y-2">
                  {runState?.scheduleId === schedule.id && runState.runs.map((run) => (
                    <div className="rounded-xl bg-muted/45 p-3" key={run.id || `${run.runId}-${run.actualFireAt}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("chat-meta-text rounded-full px-2 py-1", runTone(run.outcome))}>{run.outcome}</span>
                        <span className="chat-meta-text text-muted-foreground">{run.triggerKind === "manual" ? "Manual run" : "Scheduled run"} · {formatFireAt(run.actualFireAt)}</span>
                      </div>
                      {run.output && <MessageResponse className="chat-message-content mt-3 text-foreground">{run.output}</MessageResponse>}
                      {run.error && <p className="chat-ui-text mt-2 text-destructive">{run.error}</p>}
                      {!run.output && !run.error && <p className="chat-ui-text mt-2 text-muted-foreground">No saved output for this run.</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
  scheduling: Clock3,
  web_search: Globe2,
  code_interpreter: Code2,
  image_generation: ImageIcon,
  code_mode: Terminal,
};

export function ToolsPanel({
  contributedTools,
  enabledToolIds,
  onToggle,
}: {
  contributedTools?: readonly ChatAppToolContribution[];
  enabledToolIds: string[];
  onToggle: (toolId: string) => void;
}) {
  const tools = [...toolCatalog, ...(contributedTools ?? [])];
  return (
    <PanelShell title="Tools" description="Choose which capabilities are available to new chat runs and schedules.">
      <div className="space-y-2">
        {tools.map((detail) => {
          const Icon = toolIcons[detail.id as SelectableToolId] ?? Blocks;
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
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background shadow-sm">{"icon" in detail && detail.icon ? detail.icon : <Icon className="size-4" />}</span>
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

export function SettingsPanel({
  extensions,
  modelCatalog,
  modelSelection,
  onModelSelectionChange,
  resourceId,
}: {
  extensions?: readonly React.ReactNode[];
  modelCatalog: ModelCatalogResponse | null;
  modelSelection: ModelSelection | null;
  onModelSelectionChange: (selection: ModelSelection) => void;
  resourceId: string;
}) {
  const [notificationState, setNotificationState] = useState<
    "loading" | "unsupported" | "install" | "unconfigured" | "off" | "on"
  >("loading");
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [pushPublicKey, setPushPublicKey] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const supportsPush =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supportsPush) {
        if (active) setNotificationState("unsupported");
        return;
      }
      const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      if (isiOS && !standalone) {
        if (active) setNotificationState("install");
        return;
      }
      const response = await fetch("/api/push", { cache: "no-store" });
      const config = await response.json() as { enabled?: boolean; publicKey?: string };
      if (!active) return;
      if (!config.enabled || !config.publicKey) {
        setNotificationState("unconfigured");
        return;
      }
      setPushPublicKey(config.publicKey);
      const registration = await navigator.serviceWorker.ready;
      setNotificationState((await registration.pushManager.getSubscription()) ? "on" : "off");
    })().catch((cause: unknown) => {
      if (active) {
        setNotificationError(cause instanceof Error ? cause.message : "Could not check notifications.");
        setNotificationState("off");
      }
    });
    return () => { active = false; };
  }, []);

  const toggleNotifications = async () => {
    setNotificationBusy(true);
    setNotificationError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setNotificationState("off");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const padding = "=".repeat((4 - pushPublicKey.length % 4) % 4);
      const bytes = Uint8Array.from(
        atob((pushPublicKey + padding).replace(/-/g, "+").replace(/_/g, "/")),
        (character) => character.charCodeAt(0),
      );
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      });
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId, subscription: subscription.toJSON() }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        await subscription.unsubscribe();
        throw new Error(payload.error || "Could not save notification subscription.");
      }
      setNotificationState("on");
    } catch (cause) {
      setNotificationError(cause instanceof Error ? cause.message : "Could not update notifications.");
    } finally { setNotificationBusy(false); }
  };

  return (
    <PanelShell
      title="Settings"
      description="Choose defaults for new chats and scheduled jobs."
    >
      <div className="rounded-2xl border p-4">
        <p className="chat-ui-emphasis">Default intelligence</p>
        <p className="chat-ui-text mt-1 text-muted-foreground">
          New schedules inherit this selection unless you choose another model for the job.
        </p>
        <div className="mt-4">
          <ModelSelectionFields
            catalog={modelCatalog}
            modelLabel="Default model"
            onChange={onModelSelectionChange}
            selection={modelSelection}
          />
        </div>
      </div>
      <div className="mt-3 flex items-start gap-3 rounded-2xl border p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted"><Bell className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="chat-ui-emphasis">Schedule notifications</p>
          <p className="chat-ui-text mt-1 text-muted-foreground">
            {notificationState === "install" ? "Add LFP Chat to your iPhone or iPad Home Screen, then enable notifications here." : notificationState === "unconfigured" ? "Web Push keys have not been configured on this server." : notificationState === "unsupported" ? "This browser does not support Web Push notifications." : notificationState === "on" ? "This device will be notified when scheduled work finishes." : "Get an alert when scheduled work finishes."}
          </p>
          {notificationError && <p className="chat-meta-text mt-2 text-destructive">{notificationError}</p>}
        </div>
        {(["off", "on"] as const).includes(notificationState as "off" | "on") && (
          <Button disabled={notificationBusy || !pushPublicKey} onClick={() => void toggleNotifications()} size="sm" variant={notificationState === "on" ? "outline" : "default"}>{notificationBusy && <LoaderCircle className="animate-spin" />}{notificationState === "on" ? "Disable" : "Enable"}</Button>
        )}
      </div>
      {extensions?.map((extension, index) => (
        <div className="mt-3" key={index}>{extension}</div>
      ))}
    </PanelShell>
  );
}
