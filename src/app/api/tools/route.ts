import { toolCatalog } from "@/lib/tool-catalog";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ tools: toolCatalog });
}
