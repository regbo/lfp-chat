import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { truncateToolValue } from "@/lib/tool-output";
import {
  createTaskIfMissing,
  createTaskListIfMissing,
  deleteTask,
  deleteTaskList,
  listTaskLists,
  listTasks,
  updateTask,
  updateTaskList,
} from "@/lib/vikunja";

const recordOutput = z.record(z.string(), z.unknown());
const links = z.array(z.object({ label: z.string().min(1).max(120), url: z.url().max(2_000) })).max(20).optional();
const tags = z.array(z.string().trim().min(1).max(32)).max(12).optional();

export const taskListTool = createTool({
  id: "task_list",
  description: "List tasks in one task list or across all lists.",
  inputSchema: z.object({ listId: z.number().int().positive().optional(), allLists: z.boolean().default(false), includeDone: z.boolean().default(false) }),
  outputSchema: z.object({ tasks: z.array(recordOutput) }),
  execute: async (input) => ({ tasks: (await listTasks(input)).map((task) => truncateToolValue(task) as Record<string, unknown>) }),
});

export const taskListListsTool = createTool({
  id: "task_list_lists",
  description: "List task lists and their numeric IDs.",
  inputSchema: z.object({}), outputSchema: z.object({ lists: z.array(recordOutput) }),
  execute: async () => ({ lists: (await listTaskLists()).map((list) => truncateToolValue(list) as Record<string, unknown>) }),
});

export const taskListCreateTool = createTool({
  id: "task_list_create", description: "Idempotently create a task list.",
  inputSchema: z.object({ name: z.string().trim().min(1).max(250), description: z.string().max(20_000).optional() }), outputSchema: recordOutput,
  execute: async (input) => truncateToolValue(await createTaskListIfMissing(input)) as Record<string, unknown>,
});

export const taskListUpdateTool = createTool({
  id: "task_list_update", description: "Rename a task list or update its description.",
  inputSchema: z.object({ listId: z.number().int().positive(), name: z.string().trim().min(1).max(250).optional(), description: z.string().max(20_000).optional() }), outputSchema: recordOutput,
  execute: async ({ listId, ...input }) => truncateToolValue(await updateTaskList(listId, input)) as Record<string, unknown>,
});

export const taskListDeleteTool = createTool({
  id: "task_list_delete", description: "Permanently delete a task list after explicit user confirmation.",
  inputSchema: z.object({ listId: z.number().int().positive() }), outputSchema: z.object({ deleted: z.boolean(), listId: z.number() }),
  execute: async ({ listId }) => { await deleteTaskList(listId); return { deleted: true, listId }; },
});

export const taskCreateTool = createTool({
  id: "task_create", description: "Idempotently create an open task, avoiding matching titles or source URLs.",
  inputSchema: z.object({ listId: z.number().int().positive().optional(), title: z.string().min(1).max(500), description: z.string().max(20_000).optional(), dueDate: z.iso.datetime({ offset: true }).nullable().optional(), priority: z.number().int().min(0).max(5).optional(), links, tags }), outputSchema: recordOutput,
  execute: async (input) => truncateToolValue(await createTaskIfMissing(input)) as Record<string, unknown>,
});

export const taskUpdateTool = createTool({
  id: "task_update", description: "Update, move, complete, or reopen a task by numeric ID.",
  inputSchema: z.object({ taskId: z.number().int().positive(), listId: z.number().int().positive().optional(), title: z.string().min(1).max(500).optional(), description: z.string().max(20_000).optional(), dueDate: z.iso.datetime({ offset: true }).nullable().optional(), priority: z.number().int().min(0).max(5).optional(), done: z.boolean().optional(), links, tags }), outputSchema: recordOutput,
  execute: async ({ taskId, ...input }) => truncateToolValue(await updateTask(taskId, input)) as Record<string, unknown>,
});

export const taskDeleteTool = createTool({
  id: "task_delete", description: "Permanently delete a task after explicit user confirmation.",
  inputSchema: z.object({ taskId: z.number().int().positive() }), outputSchema: z.object({ deleted: z.boolean(), taskId: z.number() }),
  execute: async ({ taskId }) => { await deleteTask(taskId); return { deleted: true, taskId }; },
});
