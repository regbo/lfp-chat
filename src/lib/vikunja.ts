import { serverConfig } from "@/lib/config";
import type { Task, TaskLink, TaskList } from "@/lib/tasks";

const linksMarker = /\n?<!-- lfp-chat:task-links (\[[\s\S]*?\]) -->\s*$/;

function decodeDescription(value = "") {
  const match = value.match(linksMarker);
  if (!match) return { description: value, links: [] as TaskLink[] };
  try {
    const links = JSON.parse(match[1]!) as TaskLink[];
    return {
      description: value.replace(linksMarker, "").trimEnd(),
      links: Array.isArray(links)
        ? links.filter(
            (link) =>
              typeof link?.label === "string" && typeof link?.url === "string",
          )
        : [],
    };
  } catch {
    return { description: value, links: [] as TaskLink[] };
  }
}

function encodeDescription(description = "", links: TaskLink[] = []) {
  if (!links.length) return description;
  const body = description.trimEnd();
  return `${body}${body ? "\n\n" : ""}<!-- lfp-chat:task-links ${JSON.stringify(links)} -->`;
}

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
  const details = decodeDescription(value.description);
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
}) {
  const projectId = input.listId ?? configuration().projectId;
  const createdTask = await request<VikunjaTask>(`api/v1/projects/${projectId}/tasks`, {
    method: "PUT",
    body: JSON.stringify({
      title: input.title,
      ...((input.description || input.links?.length)
        ? { description: encodeDescription(input.description, input.links) }
        : {}),
      ...(input.dueDate ? { due_date: input.dueDate } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    }),
  });
  return task(await request<VikunjaTask>(`api/v1/tasks/${createdTask.id}`));
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
  },
) {
  let description = update.description;
  let links = update.links;
  if (
    (links !== undefined && description === undefined) ||
    (description !== undefined && links === undefined)
  ) {
    const currentDetails = decodeDescription(
      (await request<VikunjaTask>(`api/v1/tasks/${taskId}`)).description,
    );
    description ??= currentDetails.description;
    links ??= currentDetails.links;
  }
  const updated = await request<VikunjaTask>(`api/v1/tasks/${taskId}`, {
    method: "POST",
    body: JSON.stringify({
      ...(update.listId !== undefined ? { project_id: update.listId } : {}),
      ...(update.title !== undefined ? { title: update.title } : {}),
      ...(description !== undefined || links !== undefined
        ? { description: encodeDescription(description, links) }
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
