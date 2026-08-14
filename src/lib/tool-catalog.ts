export const TOOLS_CONTEXT_KEY = "lfp.tools";
export const TOOL_CATALOG_VERSION = 5;

export const toolCatalog = [
  {
    id: "url_fetch",
    title: "URL fetch",
    description: "Fetch a specific public URL with browser-like request behavior.",
    defaultEnabled: true,
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Create reusable data tools and tool-backed dashboard views.",
    defaultEnabled: true,
  },
  {
    id: "scheduling",
    title: "Scheduling",
    description: "Create and inspect recurring agent work from chat.",
    defaultEnabled: true,
  },
  {
    id: "web_search",
    title: "Web search",
    description: "Search current information with the model provider's hosted tool.",
    defaultEnabled: true,
  },
  {
    id: "code_interpreter",
    title: "Code interpreter",
    description: "Analyze files and data in OpenAI's hosted Python sandbox.",
    defaultEnabled: true,
  },
  {
    id: "image_generation",
    title: "Image generation",
    description: "Create images with OpenAI's hosted image tool.",
    defaultEnabled: true,
  },
  {
    id: "code_mode",
    title: "Code mode",
    description: "Read, edit, search, and execute commands directly on this host machine.",
    defaultEnabled: false,
    dangerous: true,
  },
] as const;

export type SelectableToolId = (typeof toolCatalog)[number]["id"];

export const defaultEnabledToolIds: SelectableToolId[] = toolCatalog
  .filter((tool) => tool.defaultEnabled)
  .map((tool) => tool.id);

export function orderToolsWithCodeModeLast<T extends { id: string }>(
  tools: readonly T[],
) {
  return [...tools].toSorted((left, right) => {
    if (left.id === "code_mode") return 1;
    if (right.id === "code_mode") return -1;
    return 0;
  });
}

export function normalizeEnabledToolIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [...defaultEnabledToolIds];
  return Array.from(
    new Set(
      value.filter((id): id is string =>
        typeof id === "string" && /^[a-z][a-z0-9_-]{0,62}$/.test(id),
      ),
    ),
  );
}

export function migrateEnabledToolIds(
  value: unknown,
  storedCatalogVersion: number,
): string[] {
  const normalized = normalizeEnabledToolIds(value);
  // Scheduling was introduced in catalog v2 and should be available once to
  // people whose saved v1 selection predates the capability. They can still
  // disable it normally after this one-time migration.
  const additions = [
    ...(storedCatalogVersion < 2 ? ["scheduling"] : []),
    ...(storedCatalogVersion < 4 ? ["url_fetch", "dashboard"] : []),
  ];
  return Array.from(new Set([...normalized, ...additions])).filter(
    (id) => !["calculator", "monty", "search", "cache"].includes(id),
  );
}
