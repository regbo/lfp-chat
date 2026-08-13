import { serverConfig } from "@/lib/config";
import {
  findDuplicateOpenTask,
  findDuplicateTaskList,
  normalizeTaskIdentity,
  taskCreationLockKey,
} from "@/lib/task-dedupe";
import { decodeTaskDescription, encodeTaskDescription } from "@/lib/task-metadata";
import type { Task, TaskLink, TaskList } from "@/lib/tasks";

type VikunjaProject = {
  id: number;
  title: string;
  description?: string;
  created?: string;
  updated?: string;
  child_projects?: VikunjaProject[];
};

type VikunjaTask = {
  id: number;
  project_id: number;
  title: string;
  description?: string;
  done: boolean;
  due_date?: string;
  priority?: number;
  created?: string;
  updated?: string;
};

const globalForTaskCreation = globalThis as typeof globalThis & {
  lfpTaskCreationLocks?: Map<string, Promise<void>>;
};

const taskCreationLocks =
  (globalForTaskCreation.lfpTaskCreationLocks ??= new Map<string, Promise<void>>());

async function serializeCreation<T>(key: string, action: () => Promise<T>) {
  const previous = taskCreationLocks.get(key) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  taskCreationLocks.set(key, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (taskCreationLocks.get(key) === queued) taskCreationLocks.delete(key);
  }
}

function configuration() {
  if (!serverConfig.vikunjaApiUrl || !serverConfig.vikunjaApiToken) {
    throw new Error("The task service is not configured.");
  }
  return {
    baseUrl: serverConfig.vikunjaApiUrl.replace(/\/$/, ""),
    token: serverConfig.vikunjaApiToken,
    projectId: serverConfig.vikunjaProjectId,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, token } = configuration();
  const response = await fetch(new URL(path, `${baseUrl}/`), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Task service request failed with HTTP ${response.status}: ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function taskList(project: VikunjaProject): TaskList {
  return {
    id: project.id,
    name: project.title,
    ...(project.description ? { description: project.description } : {}),
    ...(project.created ? { createdAt: project.created } : {}),
    ...(project.updated ? { updatedAt: project.updated } : {}),
  };
}

function task(value: VikunjaTask): Task {
  const details = decodeTaskDescription(value.description);
  return {
    id: value.id,
    listId: value.project_id,
    title: value.title,
    ...(details.description ? { description: details.description } : {}),
    done: value.done,
    ...(value.due_date && !value.due_date.startsWith("0001-")
      ? { dueDate: value.due_date }
      : {}),
    ...(value.priority !== undefined ? { priority: value.priority } : {}),
    ...(details.links.length ? { links: details.links } : {}),
    ...(details.tags.length ? { tags: details.tags } : {}),
    ...(value.created ? { createdAt: value.created } : {}),
    ...(value.updated ? { updatedAt: value.updated } : {}),
  };
}

function flattenProjects(projects: VikunjaProject[]): VikunjaProject[] {
  return projects.flatMap((project) => [
    project,
    ...flattenProjects(project.child_projects ?? []),
  ]);
}

export function defaultTaskListId() {
  return configuration().projectId;
}

export async function listTaskLists() {
  const projects = await request<VikunjaProject[]>("api/v1/projects?per_page=100");
  return flattenProjects(projects)
    .map(taskList)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function createTaskList(input: {
  name: string;
  description?: string;
}) {
  const project = await request<VikunjaProject>("api/v1/projects", {
    method: "PUT",
    body: JSON.stringify({
      title: input.name,
      ...(input.description ? { description: input.description } : {}),
    }),
  });
  return taskList(project);
}

export async function createTaskListIfMissing(input: {
  name: string;
  description?: string;
}) {
  const lockKey = `list:${normalizeTaskIdentity(input.name)}`;
  return serializeCreation(lockKey, async () => {
    const existing = findDuplicateTaskList(await listTaskLists(), input.name);
    if (existing) return { created: false as const, list: existing };
    return { created: true as const, list: await createTaskList(input) };
  });
}

export async function updateTaskList(
  listId: number,
  update: { name?: string; description?: string },
) {
  const project = await request<VikunjaProject>(`api/v1/projects/${listId}`, {
    method: "POST",
    body: JSON.stringify({
      ...(update.name !== undefined ? { title: update.name } : {}),
      ...(update.description !== undefined
        ? { description: update.description }
        : {}),
    }),
  });
  return taskList(project);
}

export async function deleteTaskList(listId: number) {
  await request<unknown>(`api/v1/projects/${listId}`, { method: "DELETE" });
}

export async function listTasks(input: {
  listId?: number;
  includeDone?: boolean;
  allLists?: boolean;
} = {}) {
  const projectId = input.listId ?? configuration().projectId;
  const filters = [
    ...(input.allLists ? [] : [`project = ${projectId}`]),
    ...(input.includeDone ? [] : ["done = false"]),
  ];
  const query = new URLSearchParams({
    ...(filters.length ? { filter: filters.join(" && ") } : {}),
    sort_by: "due_date",
    order_by: "asc",
    per_page: "100",
  });
  return (await request<VikunjaTask[]>(`api/v1/tasks?${query}`)).map(task);
}

export async function createTask(input: {
  listId?: number;
  title: string;
  description?: string;
  dueDate?: string | null;
  priority?: number;
  links?: TaskLink[];
  tags?: string[];
}) {
  const projectId = input.listId ?? configuration().projectId;
  const createdTask = await request<VikunjaTask>(`api/v1/projects/${projectId}/tasks`, {
    method: "PUT",
    body: JSON.stringify({
      title: input.title,
      ...((input.description || input.links?.length || input.tags?.length)
        ? { description: encodeTaskDescription(input.description, input.links, input.tags) }
        : {}),
      ...(input.dueDate ? { due_date: input.dueDate } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    }),
  });
  return task(await request<VikunjaTask>(`api/v1/tasks/${createdTask.id}`));
}

export async function createTaskIfMissing(input: {
  listId?: number;
  title: string;
  description?: string;
  dueDate?: string | null;
  priority?: number;
  links?: TaskLink[];
  tags?: string[];
}) {
  const listId = input.listId ?? configuration().projectId;
  return serializeCreation(
    `task:${taskCreationLockKey({ listId, title: input.title, links: input.links })}`,
    async () => {
      const duplicate = findDuplicateOpenTask(
        await listTasks({ allLists: true, includeDone: false }),
        { listId, title: input.title, links: input.links },
      );
      if (duplicate) {
        return {
          created: false as const,
          duplicateReason: duplicate.reason,
          task: duplicate.task,
        };
      }
      return {
        created: true as const,
        task: await createTask({ ...input, listId }),
      };
    },
  );
}

export async function updateTask(
  taskId: number,
  update: {
    listId?: number;
    title?: string;
    description?: string;
    dueDate?: string | null;
    done?: boolean;
    priority?: number;
    links?: TaskLink[];
    tags?: string[];
  },
) {
  let description = update.description;
  let links = update.links;
  let tags = update.tags;
  if (
    [description, links, tags].some((value) => value !== undefined) &&
    [description, links, tags].some((value) => value === undefined)
  ) {
    const currentDetails = decodeTaskDescription(
      (await request<VikunjaTask>(`api/v1/tasks/${taskId}`)).description,
    );
    description ??= currentDetails.description;
    links ??= currentDetails.links;
    tags ??= currentDetails.tags;
  }
  const updated = await request<VikunjaTask>(`api/v1/tasks/${taskId}`, {
    method: "POST",
    body: JSON.stringify({
      ...(update.listId !== undefined ? { project_id: update.listId } : {}),
      ...(update.title !== undefined ? { title: update.title } : {}),
      ...(description !== undefined || links !== undefined || tags !== undefined
        ? { description: encodeTaskDescription(description, links, tags) }
        : {}),
      ...(update.dueDate !== undefined
        ? { due_date: update.dueDate ?? "0001-01-01T00:00:00Z" }
        : {}),
      ...(update.done !== undefined ? { done: update.done } : {}),
      ...(update.priority !== undefined ? { priority: update.priority } : {}),
    }),
  });
  return task(updated);
}

export async function deleteTask(taskId: number) {
  await request<unknown>(`api/v1/tasks/${taskId}`, { method: "DELETE" });
}
