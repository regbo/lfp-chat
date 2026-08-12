import { z } from "zod";

import {
  createTaskList,
  defaultTaskListId,
  deleteTaskList,
  listTaskLists,
  updateTaskList,
} from "@/lib/vikunja";

const listFields = z.object({
  name: z.string().trim().min(1).max(250),
  description: z.string().max(20_000).optional(),
});

const updateSchema = listFields.partial().extend({
  id: z.number().int().positive(),
}).refine(({ name, description }) => name !== undefined || description !== undefined, {
  message: "At least one list field is required.",
});

export async function GET() {
  try {
    return Response.json({
      lists: await listTaskLists(),
      defaultListId: defaultTaskListId(),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load task lists." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const parsed = listFields.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  try {
    return Response.json({ list: await createTaskList(parsed.data) }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create task list." },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request) {
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { id, ...update } = parsed.data;
  try {
    return Response.json({ list: await updateTaskList(id, update) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not update task list." },
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
    await deleteTaskList(parsed.data.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not delete task list." },
      { status: 502 },
    );
  }
}
