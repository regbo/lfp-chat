import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { z } from "zod";

import { mastraClient } from "@/lib/mastra-client";

export const runtime = "nodejs";

const updateThreadSchema = z
  .object({
    resourceId: z.string().min(1),
    title: z.string().trim().min(1).max(100).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    ({ title, pinned, archived }) =>
      title !== undefined || pinned !== undefined || archived !== undefined,
    { message: "At least one thread change is required." },
  );

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const resourceId = new URL(request.url).searchParams.get("resourceId");
  if (!resourceId) {
    return Response.json({ error: "resourceId is required." }, { status: 400 });
  }

  try {
    const { threadId } = await params;
    const thread = mastraClient.getMemoryThread({
      threadId,
      agentId: "chatAgent",
    });
    const searchParams = new URL(request.url).searchParams;
    const page = Math.max(0, Number(searchParams.get("page") || 0));
    const perPage = Math.min(
      40,
      Math.max(4, Number(searchParams.get("perPage") || 12)),
    );
    const [details, result] = await Promise.all([
      thread.get(),
      thread.listMessages({
        page,
        perPage,
        orderBy: { field: "createdAt", direction: "DESC" },
      }),
    ]);
    if (details.resourceId !== resourceId) {
      return Response.json({ error: "Chat not found." }, { status: 404 });
    }
    const messages = [...result.messages].reverse();

    return Response.json({
      messages: toAISdkMessages(messages, { version: "v6" }),
      page,
      perPage,
      hasMore: result.messages.length === perPage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load chat.";
    return Response.json({ error: message }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params;
    const resourceId = new URL(request.url).searchParams.get("resourceId");
    if (!resourceId) {
      return Response.json({ error: "resourceId is required." }, { status: 400 });
    }
    const thread = mastraClient.getMemoryThread({ threadId, agentId: "chatAgent" });
    const details = await thread.get();
    if (details.resourceId !== resourceId) {
      return Response.json({ error: "Chat not found." }, { status: 404 });
    }
    await thread.delete();
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete chat.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const parsed = updateThreadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid thread update." },
      { status: 400 },
    );
  }

  try {
    const { threadId } = await params;
    const thread = mastraClient.getMemoryThread({ threadId, agentId: "chatAgent" });
    const details = await thread.get();
    if (details.resourceId !== parsed.data.resourceId) {
      return Response.json({ error: "Chat not found." }, { status: 404 });
    }

    const metadata = { ...(details.metadata || {}) };
    if (parsed.data.pinned !== undefined) metadata.pinned = parsed.data.pinned;
    if (parsed.data.archived !== undefined) {
      metadata.archived = parsed.data.archived;
      if (parsed.data.archived) metadata.pinned = false;
    }

    const updated = await thread.update({
      resourceId: parsed.data.resourceId,
      title: parsed.data.title || details.title || "New chat",
      metadata,
    });
    return Response.json({ thread: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update chat.";
    return Response.json({ error: message }, { status: 500 });
  }
}
