"use client";

import {
  CalendarDays,
  Check,
  Circle,
  Folder,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Task, TaskLink, TaskList } from "@/lib/tasks";

type TaskDraft = {
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  listId: string;
  links: TaskLink[];
};

const emptyTaskDraft = (listId: number): TaskDraft => ({
  title: "",
  description: "",
  dueDate: "",
  priority: "0",
  listId: String(listId),
  links: [],
});

function taskDraft(task: Task): TaskDraft {
  const date = task.dueDate ? new Date(task.dueDate) : null;
  return {
    title: task.title,
    description: task.description ?? "",
    dueDate: date && !Number.isNaN(date.getTime())
      ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16)
      : "",
    priority: String(task.priority ?? 0),
    listId: String(task.listId),
    links: task.links ?? [],
  };
}

async function responseJson<T>(response: Response, fallback: string) {
  const payload = response.status === 204
    ? {} as T & { error?: string }
    : await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || fallback);
  return payload as T;
}

function formatDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function TasksPanel() {
  const [lists, setLists] = useState<TaskList[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [listDialog, setListDialog] = useState<"create" | "edit" | null>(null);
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [taskDialog, setTaskDialog] = useState<"create" | "edit" | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);

  const selectedList = useMemo(
    () => lists.find((list) => list.id === selectedListId) ?? null,
    [lists, selectedListId],
  );

  const loadTasks = useCallback(async (listId: number) => {
    const response = await fetch(`/api/tasks?listId=${listId}`, { cache: "no-store" });
    const payload = await responseJson<{ tasks?: Task[] }>(response, "Could not load tasks.");
    setTasks(payload.tasks ?? []);
  }, []);

  const loadLists = useCallback(async (preferredId?: number) => {
    const response = await fetch("/api/task-lists", { cache: "no-store" });
    const payload = await responseJson<{
      lists?: TaskList[];
      defaultListId?: number;
    }>(response, "Could not load task lists.");
    const nextLists = payload.lists ?? [];
    setLists(nextLists);
    const nextId =
      (preferredId && nextLists.some((list) => list.id === preferredId) && preferredId) ||
      (selectedListId && nextLists.some((list) => list.id === selectedListId) && selectedListId) ||
      (payload.defaultListId && nextLists.some((list) => list.id === payload.defaultListId) && payload.defaultListId) ||
      nextLists[0]?.id ||
      null;
    setSelectedListId(nextId);
    if (nextId) await loadTasks(nextId);
    else setTasks([]);
  }, [loadTasks, selectedListId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (active) await loadLists();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load tasks.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // The initial load deliberately owns selection setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectList(listId: number) {
    setSelectedListId(listId);
    setLoading(true);
    setError("");
    try { await loadTasks(listId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load tasks."); }
    finally { setLoading(false); }
  }

  function openNewList() {
    setListName("");
    setListDescription("");
    setListDialog("create");
  }

  function openEditList() {
    if (!selectedList) return;
    setListName(selectedList.name);
    setListDescription(selectedList.description ?? "");
    setListDialog("edit");
  }

  async function saveList(event: FormEvent) {
    event.preventDefault();
    if (!listName.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const editing = listDialog === "edit" && selectedList;
      const response = await fetch("/api/task-lists", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          name: listName.trim(),
          description: listDescription.trim(),
        }),
      });
      const payload = await responseJson<{ list?: TaskList }>(response, `Could not ${editing ? "update" : "create"} task list.`);
      setListDialog(null);
      await loadLists(payload.list?.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save task list.");
    } finally { setSaving(false); }
  }

  async function removeList() {
    if (!selectedList || !window.confirm(`Delete “${selectedList.name}” and every task in it? This cannot be undone.`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/task-lists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedList.id }),
      });
      await responseJson(response, "Could not delete task list.");
      setSelectedListId(null);
      await loadLists();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete task list.");
    } finally { setSaving(false); }
  }

  function openNewTask() {
    if (!selectedListId) return;
    setActiveTask(null);
    setDraft(emptyTaskDraft(selectedListId));
    setTaskDialog("create");
  }

  function openTask(task: Task) {
    setActiveTask(task);
    setDraft(taskDraft(task));
    setTaskDialog("edit");
  }

  async function saveTask(event: FormEvent) {
    event.preventDefault();
    if (!draft?.title.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const editing = taskDialog === "edit" && activeTask;
      const response = await fetch("/api/tasks", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          listId: Number(draft.listId),
          title: draft.title.trim(),
          description: draft.description.trim(),
          dueDate: draft.dueDate ? new Date(draft.dueDate).toISOString() : null,
          priority: Number(draft.priority),
          links: draft.links.filter((link) => link.label.trim() && link.url.trim()),
        }),
      });
      await responseJson(response, `Could not ${editing ? "update" : "create"} task.`);
      setTaskDialog(null);
      setActiveTask(null);
      if (Number(draft.listId) !== selectedListId) await selectList(Number(draft.listId));
      else if (selectedListId) await loadTasks(selectedListId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save task.");
    } finally { setSaving(false); }
  }

  async function setDone(task: Task, done: boolean) {
    setTasks((current) => current.filter((item) => item.id !== task.id));
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, done }),
      });
      await responseJson(response, "Could not update task.");
    } catch (cause) {
      if (selectedListId) await loadTasks(selectedListId).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Could not update task.");
    }
  }

  async function removeTask() {
    if (!activeTask || !window.confirm(`Delete “${activeTask.title}”? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeTask.id }),
      });
      await responseJson(response, "Could not delete task.");
      setTaskDialog(null);
      setActiveTask(null);
      if (selectedListId) await loadTasks(selectedListId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete task.");
    } finally { setSaving(false); }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-12 pt-8 md:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="chat-display-text">Tasks</h1>
          <div className="flex gap-2">
            <Button className="rounded-full" onClick={openNewList} variant="outline"><Plus /> List</Button>
            <Button className="rounded-full" disabled={!selectedListId} onClick={openNewTask}><Plus /> Task</Button>
          </div>
        </div>

        {error && <p className="chat-ui-text mt-4 rounded-xl bg-destructive/10 p-3 text-destructive" role="alert">{error}</p>}

        <div className="mt-6 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
          <div className="md:hidden">
            {lists.length > 0 && selectedListId && (
              <Select onValueChange={(value) => value && void selectList(Number(value))} value={String(selectedListId)}>
                <SelectTrigger className="w-full" aria-label="Task list"><SelectValue /></SelectTrigger>
                <SelectContent>{lists.map((list) => <SelectItem key={list.id} value={String(list.id)}>{list.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>

          <nav aria-label="Task lists" className="hidden min-w-0 md:block">
            <p className="chat-meta-text mb-2 px-2 text-muted-foreground">Lists</p>
            <div className="space-y-0.5">
              {lists.map((list) => (
                <button
                  className={cn("chat-ui-text flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left", list.id === selectedListId ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}
                  key={list.id}
                  onClick={() => void selectList(list.id)}
                  type="button"
                >
                  <Folder className="size-4 shrink-0" /><span className="truncate">{list.name}</span>
                </button>
              ))}
            </div>
          </nav>

          <section className="mt-5 min-w-0 md:mt-0">
            {selectedList && (
              <div className="flex min-h-9 items-start justify-between gap-3 border-b pb-4">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-lg font-semibold">{selectedList.name}</h2>
                    {!loading && <span className="chat-meta-text text-muted-foreground">{tasks.length} open</span>}
                  </div>
                  {selectedList.description && <p className="chat-ui-text mt-1 text-muted-foreground">{selectedList.description}</p>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button aria-label="Manage list" size="icon-sm" variant="ghost" />}><MoreHorizontal /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 p-1">
                    <DropdownMenuItem className="gap-2 px-2 py-1.5" onClick={openEditList}><Pencil /> Edit list</DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 px-2 py-1.5" onClick={() => void removeList()} variant="destructive"><Trash2 /> Delete list</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {loading ? (
              <div className="chat-ui-text flex items-center justify-center gap-2 py-14 text-muted-foreground"><Spinner /> Loading…</div>
            ) : !selectedList ? (
              <div className="py-14 text-center"><p className="chat-ui-text text-muted-foreground">Create a list to start organizing tasks.</p><Button className="mt-4" onClick={openNewList}><Plus /> New list</Button></div>
            ) : tasks.length === 0 ? (
              <button className="chat-ui-text w-full rounded-xl py-14 text-center text-muted-foreground hover:bg-muted/40" onClick={openNewTask} type="button">No open tasks. Add one.</button>
            ) : (
              <ul className="divide-y divide-border/70">
                {tasks.map((task) => {
                  return (
                    <li key={task.id}>
                      <div className="group flex min-w-0 items-start gap-3 rounded-lg py-3.5 pr-2 transition-colors hover:bg-muted/45">
                        <button aria-label={`Complete ${task.title}`} className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground" onClick={() => void setDone(task, true)} type="button"><Circle className="size-4" /></button>
                        <button className="min-w-0 flex-1 text-left" onClick={() => openTask(task)} type="button">
                          <p className="chat-ui-text break-words font-medium">{task.title}</p>
                          {task.description && <p className="chat-meta-text mt-1 line-clamp-2 text-muted-foreground">{task.description}</p>}
                          <div className="chat-meta-text mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                            {task.dueDate && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{formatDate(task.dueDate)}</span>}
                            {!!task.links?.length && <span className="inline-flex items-center gap-1"><Link2 className="size-3.5" />{task.links.length} {task.links.length === 1 ? "link" : "links"}</span>}
                          </div>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Dialog onOpenChange={(open) => !open && setListDialog(null)} open={listDialog !== null}>
        <DialogContent>
          <form onSubmit={saveList}>
            <DialogHeader><DialogTitle>{listDialog === "edit" ? "Edit list" : "New list"}</DialogTitle><DialogDescription className="sr-only">Name and describe this task list.</DialogDescription></DialogHeader>
            <div className="mt-5 space-y-3">
              <Input autoFocus maxLength={250} onChange={(event) => setListName(event.target.value)} placeholder="List name" required value={listName} />
              <Textarea className="min-h-20" maxLength={20_000} onChange={(event) => setListDescription(event.target.value)} placeholder="Description (optional)" value={listDescription} />
            </div>
            <DialogFooter className="mt-6"><Button onClick={() => setListDialog(null)} type="button" variant="ghost">Cancel</Button><Button disabled={saving} type="submit">{saving && <Spinner />} Save list</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && setTaskDialog(null)} open={taskDialog !== null}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          {draft && (
            <form onSubmit={saveTask}>
              <DialogHeader>
                <DialogTitle>{taskDialog === "edit" ? "Task details" : "New task"}</DialogTitle>
                <DialogDescription className="sr-only">Manage the task and its source links.</DialogDescription>
              </DialogHeader>
              <div className="mt-5 space-y-4">
                <Input autoFocus maxLength={500} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What needs doing?" required value={draft.title} />
                <Textarea className="min-h-28" maxLength={20_000} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Notes and context" value={draft.description} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><label className="chat-meta-text text-muted-foreground" htmlFor="task-list">List</label><Select onValueChange={(value) => value && setDraft({ ...draft, listId: value })} value={draft.listId}><SelectTrigger className="w-full" id="task-list"><SelectValue /></SelectTrigger><SelectContent>{lists.map((list) => <SelectItem key={list.id} value={String(list.id)}>{list.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><label className="chat-meta-text text-muted-foreground" htmlFor="task-priority">Priority</label><Select onValueChange={(value) => value && setDraft({ ...draft, priority: value })} value={draft.priority}><SelectTrigger className="w-full" id="task-priority"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">None</SelectItem><SelectItem value="1">Low</SelectItem><SelectItem value="2">Medium</SelectItem><SelectItem value="3">High</SelectItem><SelectItem value="4">Urgent</SelectItem><SelectItem value="5">Critical</SelectItem></SelectContent></Select></div>
                </div>
                <div className="space-y-1.5"><label className="chat-meta-text text-muted-foreground" htmlFor="task-due">Due</label><Input id="task-due" onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} type="datetime-local" value={draft.dueDate} /></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><p className="chat-meta-text text-muted-foreground">Source links</p><Button onClick={() => setDraft({ ...draft, links: [...draft.links, { label: "", url: "" }] })} size="sm" type="button" variant="ghost"><Plus /> Add link</Button></div>
                  {draft.links.map((link, index) => (
                    <div className="grid grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)_auto] gap-2" key={index}>
                      <Input aria-label={`Link ${index + 1} label`} onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} placeholder="Source email" value={link.label} />
                      <Input aria-label={`Link ${index + 1} URL`} onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item) })} placeholder="https://…" type="url" value={link.url} />
                      <Button aria-label={`Remove link ${index + 1}`} onClick={() => setDraft({ ...draft, links: draft.links.filter((_, itemIndex) => itemIndex !== index) })} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>
                    </div>
                  ))}
                </div>
                {taskDialog === "edit" && activeTask && (
                  <div className="chat-meta-text flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-muted-foreground">
                    <span>Task #{activeTask.id}</span>
                    {activeTask.createdAt && <span>Created {formatDate(activeTask.createdAt)}</span>}
                    {activeTask.updatedAt && <span>Updated {formatDate(activeTask.updatedAt)}</span>}
                  </div>
                )}
              </div>
              <DialogFooter className="mt-6 sm:justify-between">
                <div>{taskDialog === "edit" && <Button disabled={saving} onClick={() => void removeTask()} type="button" variant="destructive"><Trash2 /> Delete</Button>}</div>
                <div className="flex gap-2"><Button onClick={() => setTaskDialog(null)} type="button" variant="ghost">Cancel</Button><Button disabled={saving} type="submit">{saving ? <Spinner /> : taskDialog === "edit" ? <Check /> : <Plus />}{saving ? "Saving…" : "Save task"}</Button></div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
