"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ExternalLink,
  Folder,
  Link2,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

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
import { cleanTaskTitle } from "@/lib/task-metadata";
import type { Task, TaskLink, TaskList } from "@/lib/tasks";

type TaskDraft = {
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  listId: string;
  links: TaskLink[];
  tags: string[];
};

const priorities = [
  { value: "0", label: "No priority", tone: "none" },
  { value: "1", label: "Low", tone: "low" },
  { value: "2", label: "Medium", tone: "medium" },
  { value: "3", label: "High", tone: "high" },
  { value: "4", label: "Urgent", tone: "urgent" },
  { value: "5", label: "Critical", tone: "critical" },
] as const;

function priorityFor(value?: number | string) {
  return priorities.find((priority) => priority.value === String(value ?? 0)) ?? priorities[0];
}

const emptyTaskDraft = (listId: number): TaskDraft => ({
  title: "",
  description: "",
  dueDate: "",
  priority: "0",
  listId: String(listId),
  links: [],
  tags: [],
});

function taskDraft(task: Task): TaskDraft {
  const date = task.dueDate ? new Date(task.dueDate) : null;
  const cleaned = cleanTaskTitle(task.title, task.tags);
  return {
    title: cleaned.title,
    description: task.description ?? "",
    dueDate: date && !Number.isNaN(date.getTime())
      ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16)
      : "",
    priority: String(task.priority ?? 0),
    listId: String(task.listId),
    links: task.links ?? [],
    tags: cleaned.tags,
  };
}

async function responseJson<T>(response: Response, fallback: string) {
  const payload = response.status === 204
    ? {} as T & { error?: string }
    : await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || fallback);
  return payload as T;
}

function formatDate(value?: string, includeTime = true) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

function dueState(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const overdue = date.getTime() < Date.now();
  return { label: `${overdue ? "Overdue · " : ""}${formatDate(value, false)}`, overdue };
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return <label className="task-field-label" htmlFor={htmlFor}>{children}</label>;
}

function PriorityMark({ value }: { value?: number | string }) {
  const priority = priorityFor(value);
  return <span aria-hidden="true" className="task-priority-mark" data-tone={priority.tone} />;
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
  const [tagInput, setTagInput] = useState("");

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
    const payload = await responseJson<{ lists?: TaskList[]; defaultListId?: number }>(response, "Could not load task lists.");
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
    setTagInput("");
    setTaskDialog("create");
  }

  function openTask(task: Task) {
    setActiveTask(task);
    setDraft(taskDraft(task));
    setTagInput("");
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
          tags: draft.tags,
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

  async function setDone(task: Task) {
    setTasks((current) => current.filter((item) => item.id !== task.id));
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, done: true }),
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

  const selectedDraftList = lists.find((list) => String(list.id) === draft?.listId);
  const selectedPriority = priorityFor(draft?.priority);

  function addTag() {
    if (!draft) return;
    const tag = tagInput.trim().replace(/^#/, "");
    if (!tag || draft.tags.length >= 12 || draft.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return;
    setDraft({ ...draft, tags: [...draft.tags, tag] });
    setTagInput("");
  }

  return (
    <div className="task-page min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 md:px-8 md:pt-9">
        <header className="flex items-end justify-between gap-4 border-b border-border/70 pb-5">
          <div>
            <p className="task-eyebrow">Household</p>
            <h1 className="chat-display-text mt-1">Tasks</h1>
          </div>
          <div className="flex gap-2">
            <Button className="hidden rounded-full sm:inline-flex" onClick={openNewList} variant="outline"><Plus /> New list</Button>
            <Button className="rounded-full" disabled={!selectedListId} onClick={openNewTask}><Plus /> Add task</Button>
          </div>
        </header>

        {error && <p className="chat-ui-text mt-4 rounded-xl border border-destructive/20 bg-destructive/8 p-3 text-destructive" role="alert">{error}</p>}

        <div className="mt-5 md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
          <div className="md:hidden">
            {lists.length > 0 && selectedListId && (
              <Select onValueChange={(value) => value && void selectList(Number(value))} value={String(selectedListId)}>
                <SelectTrigger className="h-11 w-full bg-background" aria-label="Task list">
                  <ListTodo className="text-muted-foreground" />
                  <SelectValue>{selectedList?.name ?? "Choose a list"}</SelectValue>
                </SelectTrigger>
                <SelectContent>{lists.map((list) => <SelectItem key={list.id} value={String(list.id)}>{list.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>

          <nav aria-label="Task lists" className="hidden min-w-0 md:block">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="task-eyebrow">Lists</p>
              <Button aria-label="Create list" onClick={openNewList} size="icon-xs" variant="ghost"><Plus /></Button>
            </div>
            <div className="space-y-1">
              {lists.map((list) => (
                <button
                  className={cn("task-list-button", list.id === selectedListId && "task-list-button-active")}
                  key={list.id}
                  onClick={() => void selectList(list.id)}
                  type="button"
                >
                  <Folder className="size-4 shrink-0" /><span className="truncate">{list.name}</span><ChevronRight className="ml-auto size-3.5 opacity-0" />
                </button>
              ))}
            </div>
          </nav>

          <main className="mt-6 min-w-0 md:mt-0">
            {selectedList && (
              <div className="flex min-h-11 items-start justify-between gap-3 pb-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h2 className="text-xl font-semibold tracking-tight">{selectedList.name}</h2>
                    {!loading && <span className="chat-meta-text text-muted-foreground">{tasks.length} open</span>}
                  </div>
                  {selectedList.description && <p className="chat-ui-text mt-1 max-w-2xl text-muted-foreground">{selectedList.description}</p>}
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
              <div className="chat-ui-text flex items-center justify-center gap-2 py-20 text-muted-foreground"><Spinner /> Loading tasks…</div>
            ) : !selectedList ? (
              <div className="task-empty"><ListTodo /><p>No lists yet</p><Button onClick={openNewList}><Plus /> Create a list</Button></div>
            ) : tasks.length === 0 ? (
              <button className="task-empty w-full" onClick={openNewTask} type="button"><CheckCircle2 /><p>Everything is handled</p><span>Add a task when something comes up.</span></button>
            ) : (
              <ul className="task-stack">
                {tasks.map((task) => {
                  const priority = priorityFor(task.priority);
                  const due = dueState(task.dueDate);
                  const cleaned = cleanTaskTitle(task.title, task.tags);
                  return (
                    <li className="task-row" data-priority={priority.tone} key={task.id}>
                      <button aria-label={`Complete ${task.title}`} className="task-complete" onClick={() => void setDone(task)} type="button"><Circle /></button>
                      <button className="min-w-0 flex-1 py-3 pr-3 text-left" onClick={() => openTask(task)} type="button">
                        <p className="chat-ui-emphasis break-words">{cleaned.title}</p>
                        {task.description && <p className="chat-meta-text mt-1 line-clamp-2 text-muted-foreground">{task.description}</p>}
                        <div className="chat-meta-text mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
                          {cleaned.tags.map((tag) => <span className="task-tag" key={tag}>#{tag}</span>)}
                          {priority.value !== "0" && <span className="task-chip"><PriorityMark value={task.priority} />{priority.label}</span>}
                          {due && <span className={cn("task-chip", due.overdue && "task-chip-overdue")}><CalendarDays />{due.label}</span>}
                          {!!task.links?.length && <span className="task-chip"><Link2 />{task.links.length}</span>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </main>
        </div>
      </div>

      <Dialog onOpenChange={(open) => !open && setListDialog(null)} open={listDialog !== null}>
        <DialogContent>
          <form onSubmit={saveList}>
            <DialogHeader><DialogTitle>{listDialog === "edit" ? "Edit list" : "New list"}</DialogTitle><DialogDescription className="sr-only">Name and describe this task list.</DialogDescription></DialogHeader>
            <div className="mt-5 space-y-3">
              <Input autoComplete="off" maxLength={250} name="list-name" onChange={(event) => setListName(event.target.value)} placeholder="List name…" required value={listName} />
              <Textarea autoComplete="off" className="min-h-20" maxLength={20_000} name="list-description" onChange={(event) => setListDescription(event.target.value)} placeholder="Description (optional)…" value={listDescription} />
            </div>
            <DialogFooter className="mt-6"><Button onClick={() => setListDialog(null)} type="button" variant="ghost">Cancel</Button><Button disabled={saving} type="submit">{saving && <Spinner />} Save list</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && setTaskDialog(null)} open={taskDialog !== null}>
        <DialogContent className="task-editor" showCloseButton={false}>
          {draft && (
            <form className="task-editor-form" onSubmit={saveTask}>
              <DialogHeader className="task-editor-header">
                <div>
                  <DialogTitle className="text-lg">{taskDialog === "edit" ? "Edit task" : "New task"}</DialogTitle>
                  <DialogDescription className="mt-1">Keep the next step clear and easy to find.</DialogDescription>
                </div>
                <Button aria-label="Close task editor" onClick={() => setTaskDialog(null)} size="icon-sm" type="button" variant="ghost"><X /></Button>
              </DialogHeader>

              <div className="task-editor-body">
                <section className="space-y-4" aria-label="Task details">
                  <div>
                    <FieldLabel htmlFor="task-title">Task</FieldLabel>
                    <Input autoComplete="off" className="task-title-input" id="task-title" maxLength={500} name="title" onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What needs doing?" required value={draft.title} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="task-notes">Notes</FieldLabel>
                    <Textarea autoComplete="off" className="min-h-28 resize-y" id="task-notes" maxLength={20_000} name="description" onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Add context, instructions, or a quick note…" value={draft.description} />
                  </div>
                </section>

                <section className="task-editor-section" aria-labelledby="task-plan-label">
                  <h3 className="task-section-title" id="task-plan-label">Plan</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="task-list">List</FieldLabel>
                      <Select onValueChange={(value) => value && setDraft({ ...draft, listId: value })} value={draft.listId}>
                        <SelectTrigger className="task-editor-control w-full" id="task-list"><Folder /><SelectValue>{selectedDraftList?.name ?? "Choose a list"}</SelectValue></SelectTrigger>
                        <SelectContent>{lists.map((list) => <SelectItem key={list.id} value={String(list.id)}><Folder />{list.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
                      <Select onValueChange={(value) => value && setDraft({ ...draft, priority: value })} value={draft.priority}>
                        <SelectTrigger className="task-editor-control w-full" id="task-priority"><PriorityMark value={draft.priority} /><SelectValue>{selectedPriority.label}</SelectValue></SelectTrigger>
                        <SelectContent>{priorities.map((priority) => <SelectItem key={priority.value} value={priority.value}><PriorityMark value={priority.value} />{priority.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <FieldLabel htmlFor="task-due">Due</FieldLabel>
                      <Input autoComplete="off" className="task-editor-control" id="task-due" name="due-date" onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} type="datetime-local" value={draft.dueDate} />
                    </div>
                  </div>
                </section>

                <section className="task-editor-section" aria-labelledby="task-tags-label">
                  <h3 className="task-section-title" id="task-tags-label">Tags</h3>
                  <div className="flex gap-2">
                    <Input aria-label="New tag" autoComplete="off" maxLength={32} name="new-tag" onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(); } }} placeholder="School, Errand, Home…" value={tagInput} />
                    <Button disabled={!tagInput.trim() || draft.tags.length >= 12} onClick={addTag} type="button" variant="outline">Add</Button>
                  </div>
                  {draft.tags.length > 0 && <div className="flex flex-wrap gap-2">{draft.tags.map((tag) => <button className="task-tag task-tag-removable" key={tag} onClick={() => setDraft({ ...draft, tags: draft.tags.filter((item) => item !== tag) })} type="button">#{tag}<X /></button>)}</div>}
                </section>

                <section className="task-editor-section" aria-labelledby="task-sources-label">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="task-section-title" id="task-sources-label">Links</h3>
                    <Button onClick={() => setDraft({ ...draft, links: [...draft.links, { label: "", url: "" }] })} size="sm" type="button" variant="ghost"><Plus /> Add link</Button>
                  </div>
                  {draft.links.length === 0 ? (
                    <p className="chat-meta-text mt-2 text-muted-foreground">Attach the email, form, or page this task came from.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {draft.links.map((link, index) => (
                        <div className="task-link-row" key={index}>
                          <Input aria-label={`Link ${index + 1} label`} autoComplete="off" name={`link-${index + 1}-label`} onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} placeholder="Label…" value={link.label} />
                          <Input aria-label={`Link ${index + 1} URL`} autoComplete="off" name={`link-${index + 1}-url`} onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item) })} placeholder="https://…" spellCheck={false} type="url" value={link.url} />
                          {link.url && <Button aria-label={`Open link ${index + 1}`} render={<a href={link.url} rel="noreferrer" target="_blank" />} size="icon-sm" variant="ghost"><ExternalLink /></Button>}
                          <Button aria-label={`Remove link ${index + 1}`} onClick={() => setDraft({ ...draft, links: draft.links.filter((_, itemIndex) => itemIndex !== index) })} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {taskDialog === "edit" && activeTask && (
                  <p className="chat-meta-text border-t pt-4 text-muted-foreground">
                    Task #{activeTask.id}{activeTask.updatedAt ? ` · Updated ${formatDate(activeTask.updatedAt)}` : activeTask.createdAt ? ` · Created ${formatDate(activeTask.createdAt)}` : ""}
                  </p>
                )}
              </div>

              <DialogFooter className="task-editor-footer">
                <div className="mr-auto">{taskDialog === "edit" && <Button aria-label="Delete task" disabled={saving} onClick={() => void removeTask()} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>}</div>
                <Button onClick={() => setTaskDialog(null)} type="button" variant="ghost">Cancel</Button>
                <Button disabled={saving} type="submit">{saving ? <Spinner /> : <Check />}{saving ? "Saving…" : "Save task"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
