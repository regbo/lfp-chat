import { z } from "zod";

import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from "@/lib/vikunja";

const linkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  url: z.url().max(2_000),
});

const createSchema = z.object({
  listId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(20_000).optional(),
  dueDate: z.iso.datetime({ offset: true }).nullable().optional(),
  priority: z.number().int().min(0).max(5).optional(),
  links: z.array(linkSchema).max(20).optional(),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  listId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(20_000).optional(),
  dueDate: z.iso.datetime({ offset: true }).nullable().optional(),
  priority: z.number().int().min(0).max(5).optional(),
  done: z.boolean().optional(),
  links: z.array(linkSchema).max(20).optional(),
});

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const parsedListId = z.coerce.number().int().positive().safeParse(
      searchParams.get("listId"),
    );
    const allLists = searchParams.get("allLists") === "true";
    if (!allLists && !parsedListId.success) {
      return Response.json({ error: "listId is required." }, { status: 400 });
    }
    return Response.json({
      tasks: await listTasks({
        ...(parsedListId.success ? { listId: parsedListId.data } : {}),
        includeDone: searchParams.get("includeDone") === "true",
        allLists,
      }),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load tasks." },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request) {
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(
    await request.json(),
  );
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  try {
    await deleteTask(parsed.data.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not delete task." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  try {
    return Response.json({ task: await createTask(parsed.data) }, { status: 201 });
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
    return Response.json({ task: await updateTask(id, update) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not update task." },
      { status: 502 },
    );
  }
}
