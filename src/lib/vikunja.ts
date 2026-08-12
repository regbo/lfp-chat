import { serverConfig } from "@/lib/config";

export type FamilyTask = {
  id: number;
  title: string;
  description?: string;
  done: boolean;
  due_date?: string;
  priority?: number;
  assignees?: Array<{ id: number; username: string; name?: string; email?: string }>;
  created?: string;
  updated?: string;
};

function configuration() {
  if (!serverConfig.vikunjaApiUrl || !serverConfig.vikunjaApiToken) {
    throw new Error("The family task service is not configured.");
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
    throw new Error(`Family task request failed with HTTP ${response.status}: ${detail}`);
  }
  return (await response.json()) as T;
}

export async function listFamilyTasks(includeDone = false) {
  const { projectId } = configuration();
  const filter = includeDone
    ? `project = ${projectId}`
    : `project = ${projectId} && done = false`;
  const query = new URLSearchParams({
    filter,
    sort_by: "due_date",
    order_by: "asc",
    per_page: "100",
  });
  return request<FamilyTask[]>(`api/v1/tasks?${query}`);
}

async function findAssignee(search: string) {
  const users = await request<Array<{ id: number; username: string; name?: string; email?: string }>>(
    `api/v1/users?s=${encodeURIComponent(search)}`,
  );
  const normalized = search.trim().toLowerCase();
  return users.find(
    (user) =>
      user.email?.toLowerCase() === normalized ||
      user.username.toLowerCase() === normalized ||
      user.name?.toLowerCase() === normalized,
  );
}

async function ensureProjectAccess(userId: number) {
  const { projectId } = configuration();
  try {
    await request(`api/v1/projects/${projectId}/users`, {
      method: "PUT",
      body: JSON.stringify({ user_id: userId, right: 1 }),
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("HTTP 409")) throw error;
  }
}

export async function assignFamilyTask(taskId: number, assignee: string) {
  const user = await findAssignee(assignee);
  if (!user) {
    throw new Error(
      `No Vikunja user matches ${assignee}. They must sign in to Family Tasks once before assignment.`,
    );
  }
  await ensureProjectAccess(user.id);
  await request(`api/v1/tasks/${taskId}/assignees`, {
    method: "PUT",
    body: JSON.stringify({ user_id: user.id }),
  });
  return user;
}

export async function createFamilyTask(input: {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: number;
  assignee?: string;
}) {
  const { projectId } = configuration();
  const task = await request<FamilyTask>(`api/v1/projects/${projectId}/tasks`, {
    method: "PUT",
    body: JSON.stringify({
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      ...(input.dueDate ? { due_date: input.dueDate } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    }),
  });
  if (input.assignee) await assignFamilyTask(task.id, input.assignee);
  return request<FamilyTask>(`api/v1/tasks/${task.id}`);
}

export async function updateFamilyTask(
  taskId: number,
  update: { title?: string; description?: string; dueDate?: string; done?: boolean; priority?: number },
) {
  return request<FamilyTask>(`api/v1/tasks/${taskId}`, {
    method: "POST",
    body: JSON.stringify({
      ...(update.title !== undefined ? { title: update.title } : {}),
      ...(update.description !== undefined ? { description: update.description } : {}),
      ...(update.dueDate !== undefined ? { due_date: update.dueDate } : {}),
      ...(update.done !== undefined ? { done: update.done } : {}),
      ...(update.priority !== undefined ? { priority: update.priority } : {}),
    }),
  });
}
