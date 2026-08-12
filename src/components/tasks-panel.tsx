"use client";

import {
  CalendarDays,
  Check,
  Circle,
  Plus,
  UserRound,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

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
import { Spinner } from "@/components/ui/spinner";
import type { Task } from "@/lib/tasks";

async function requestTasks() {
  const response = await fetch("/api/tasks");
  const payload = (await response.json()) as {
    tasks?: Task[];
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error || "Could not load tasks.");
  return payload.tasks || [];
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setTasks(await requestTasks());
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : "Could not load tasks.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void requestTasks()
      .then((items) => {
        if (active) setTasks(items);
      })
      .catch((cause: unknown) => {
        if (active) {
          setLoadError(
            cause instanceof Error ? cause.message : "Could not load tasks.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setCreateError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          ...(assignee.trim() ? { assignee: assignee.trim() } : {}),
        }),
      });
      const payload = (await response.json()) as {
        task?: Task;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Could not create task.");
      }
      const createdTask = payload.task;
      if (createdTask) setTasks((current) => [...current, createdTask]);
      setTitle("");
      setAssignee("");
      setCreateOpen(false);
    } catch (cause) {
      setCreateError(
        cause instanceof Error ? cause.message : "Could not create task.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function completeTask(task: Task) {
    setTasks((current) => current.filter((item) => item.id !== task.id));
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, done: true }),
      });
      if (!response.ok) throw new Error("Task update failed.");
    } catch {
      await refresh();
      setLoadError(`Could not complete “${task.title}.” Try again.`);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-12 pt-8 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="chat-display-text text-balance">Tasks</h1>
            {!loading && !loadError && (
              <span className="chat-meta-text text-muted-foreground tabular-nums">
                {tasks.length} open
              </span>
            )}
          </div>
          <Button
            className="shrink-0 rounded-full"
            onClick={() => {
              setCreateError("");
              setCreateOpen(true);
            }}
          >
            <Plus aria-hidden="true" className="size-4" /> New Task
          </Button>
        </div>

        <div className="mt-7">
          {loading ? (
            <div className="chat-ui-text flex items-center justify-center gap-2 py-14 text-muted-foreground" role="status">
              <Spinner /> Loading…
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3" role="alert">
              <p className="chat-ui-text text-destructive">{loadError}</p>
              <Button className="mt-2" onClick={() => void refresh()} size="sm" variant="outline">
                Try Again
              </Button>
            </div>
          ) : tasks.length === 0 ? (
            <p className="chat-ui-text py-14 text-center text-muted-foreground" role="status">
              No open tasks.
            </p>
          ) : (
            <ul className="divide-y divide-border/70 border-y">
              {tasks.map((task) => {
                const assignees = task.assignees
                  ?.map((person) => person.name || person.username)
                  .filter(Boolean)
                  .join(", ");
                return (
                  <li className="group flex min-w-0 items-start gap-3 py-3.5 [contain-intrinsic-size:0_3.5rem] [content-visibility:auto]" key={task.id}>
                    <button
                      aria-label={`Complete ${task.title}`}
                      className="mt-px grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={() => void completeTask(task)}
                      type="button"
                    >
                      {task.done ? (
                        <Check aria-hidden="true" className="size-4" />
                      ) : (
                        <Circle aria-hidden="true" className="size-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="chat-ui-text break-words font-medium">{task.title}</p>
                      {(task.due_date || assignees) && (
                        <div className="chat-meta-text mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                          {task.due_date && (
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays aria-hidden="true" className="size-3.5" />
                              {formatDueDate(task.due_date)}
                            </span>
                          )}
                          {assignees && (
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound aria-hidden="true" className="size-3.5" />
                              {assignees}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

      </div>

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent>
          <form onSubmit={createTask}>
            <DialogHeader>
              <DialogTitle>New Task</DialogTitle>
              <DialogDescription className="sr-only">
                Create a task.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <label className="chat-ui-text font-medium" htmlFor="task-title">
                  Task
                </label>
                <Input
                  autoComplete="off"
                  id="task-title"
                  maxLength={500}
                  name="title"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Replace the air filter…"
                  required
                  value={title}
                />
              </div>
              <div className="space-y-1.5">
                <label className="chat-ui-text font-medium" htmlFor="task-assignee">
                  Assign To <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input
                  autoComplete="off"
                  id="task-assignee"
                  maxLength={250}
                  name="assignee"
                  onChange={(event) => setAssignee(event.target.value)}
                  placeholder="Name, username, or email…"
                  value={assignee}
                />
              </div>
              {createError && (
                <p aria-live="polite" className="chat-ui-text text-destructive" role="alert">
                  {createError}
                </p>
              )}
            </div>
            <DialogFooter className="mt-6">
              <Button onClick={() => setCreateOpen(false)} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={saving} type="submit">
                {saving ? <Spinner /> : <Plus aria-hidden="true" className="size-4" />}
                {saving ? "Creating…" : "Create Task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
