import { mastraClient } from "@/lib/mastra-client";
import { after } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const steerSchema = z.object({
  resourceId: z.string().min(1),
  runId: z.string().min(1),
  text: z.string().max(20_000),
  files: z.array(z.object({
    url: z.string().min(1),
    mediaType: z.string().min(1),
    filename: z.string().optional(),
  })).max(5).default([]),
}).refine((value) => value.text.trim() || value.files.length > 0, {
  message: "A steer needs text or a file.",
});

type RouteContext = { params: Promise<{ threadId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const parsed = steerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid steer." }, { status: 400 });
  }
  const { threadId } = await context.params;
  const { resourceId, runId, text, files } = parsed.data;
  const contents = [
    ...(text.trim() ? [{ type: "text" as const, text: text.trim() }] : []),
    ...files.map((file) => ({
      type: "file" as const,
      data: file.url,
      mediaType: file.mediaType,
      filename: file.filename,
    })),
  ];

  after(async () => {
    try {
      await mastraClient.getAgent("chatAgent").sendMessage({
        runId,
        resourceId,
        threadId,
        message: contents,
        ifActive: { behavior: "deliver", attributes: { source: "steer" } },
      });
    } catch (error) {
      console.error("Unable to deliver steer to the active run.", error);
    }
  });

  return Response.json({ accepted: true, runId }, { status: 202 });
}
