import { z } from "zod";

import { familyContextRequest } from "@/lib/family-context-api";

export const runtime = "nodejs";

const parametersSchema = z.object({ attachmentId: z.string().uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const parsed = parametersSchema.safeParse(await context.params);
  if (!parsed.success) {
    return Response.json({ error: "Invalid attachment identifier." }, { status: 400 });
  }

  try {
    const upstream = await familyContextRequest(
      `/v1/attachments/${parsed.data.attachmentId}/raw`,
    );
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition":
        upstream.headers.get("content-disposition") ?? "attachment",
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new Response(upstream.body, {
      headers,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not download attachment." },
      { status: 502 },
    );
  }
}
