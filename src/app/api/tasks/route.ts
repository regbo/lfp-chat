import { z } from "zod";

import {
  createFamilyTask,
  listFamilyTasks,
  updateFamilyTask,
} from "@/lib/vikunja";

const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(20_000).optional(),
  dueDate: z.iso.datetime({ offset: true }).optional(),
  priority: z.number().int().min(0).max(5).optional(),
  assignee: z.string().trim().min(1).max(250).optional(),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(20_000).optional(),
  dueDate: z.iso.datetime({ offset: true }).optional(),
  priority: z.number().int().min(0).max(5).optional(),
  done: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const includeDone = new URL(request.url).searchParams.get("includeDone") === "true";
    return Response.json({ tasks: await listFamilyTasks(includeDone) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load tasks." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  try {
    return Response.json({ task: await createFamilyTask(parsed.data) }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create task." },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request) {
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { id, ...update } = parsed.data;
  try {
    return Response.json({ task: await updateFamilyTask(id, update) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not update task." },
      { status: 502 },
    );
  }
}
