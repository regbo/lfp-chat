import { homeHostTools } from "@/host/tools";
import { toolCatalog } from "@/lib/tool-catalog";

export const runtime = "nodejs";

export async function GET() {
  const hostToolCatalog = Object.entries(homeHostTools).flatMap(([id, entry]) => {
    if (!("tools" in entry) || entry.hidden) return [];
    return [{
      id,
      title: entry.title ?? id,
      description: entry.description ?? id,
      hidden: false,
      enabled: entry.enabled ?? true,
      userConfigurable: entry.userConfigurable ?? true,
    }];
  });
  return Response.json({ tools: [...toolCatalog, ...hostToolCatalog] });
}
