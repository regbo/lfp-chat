"use client";

import { Check, Circle, Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { FamilyTask } from "@/lib/vikunja";

async function requestTasks() {
  const response = await fetch("/api/tasks");
  const payload = (await response.json()) as { tasks?: FamilyTask[]; error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not load tasks.");
  return payload.tasks || [];
}

export function TasksPanel() {
  const [tasks, setTasks] = useState<FamilyTask[]>([]);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTasks(await requestTasks());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void requestTasks()
      .then((items) => active && setTasks(items))
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load tasks.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function createTask() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          ...(assignee.trim() ? { assignee: assignee.trim() } : {}),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not create task.");
      setTitle("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create task.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(task: FamilyTask) {
    setTasks((current) => current.filter((item) => item.id !== task.id));
    const response = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, done: !task.done }),
    });
    if (!response.ok) await refresh();
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Household</h2>
        <p className="chat-meta-text text-muted-foreground">
          Shared tasks created by you, your family, chat, and ingestion automations.
        </p>
      </div>
      <div className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="Task title" className="min-h-10 flex-1 rounded-xl border bg-background px-3 outline-none focus:ring-2 focus:ring-ring" onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void createTask()} placeholder="Add a household task" value={title} />
          <input aria-label="Assignee" className="min-h-10 rounded-xl border bg-background px-3 outline-none focus:ring-2 focus:ring-ring sm:w-52" onChange={(event) => setAssignee(event.target.value)} placeholder="Assignee email (optional)" value={assignee} />
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={!title.trim() || saving} onClick={() => void createTask()} type="button">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading tasks</div>
        ) : tasks.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">No open household tasks.</p>
        ) : (
          <ul className="divide-y">
            {tasks.map((task) => (
              <li className="flex items-start gap-3 p-4" key={task.id}>
                <button aria-label={`Complete ${task.title}`} className="mt-0.5 text-muted-foreground hover:text-foreground" onClick={() => void toggle(task)} type="button">
                  {task.done ? <Check className="size-5" /> : <Circle className="size-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{task.title}</p>
                  <div className="chat-meta-text mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
                    {task.due_date && <span>Due {new Date(task.due_date).toLocaleString()}</span>}
                    {task.assignees?.map((person) => <span key={person.id}>Assigned to {person.name || person.username}</span>)}
                    <span>HOME-{task.id}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <a className="self-start text-sm text-primary underline-offset-4 hover:underline" href="https://tasks.lfpconnect.io/login?redirectToProvider=authentik" rel="noreferrer" target="_blank">
        Open full projects, Kanban, and settings
      </a>
    </div>
  );
}
