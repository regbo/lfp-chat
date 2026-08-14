export const TOOLS_CONTEXT_KEY = "lfp.tools";
export const TOOL_CATALOG_VERSION = 8;

export type ToolUiSettings = {
  /** Whether the tool is omitted from the Tools screen. */
  hidden: boolean;
  /** Whether the tool is available when the user has not saved a preference. */
  enabled: boolean;
  /** Whether the user can change the enabled state in the Tools screen. */
  userConfigurable: boolean;
};

export type ToolCatalogEntry = ToolUiSettings & {
  id: string;
  title: string;
  description: string;
  dangerous?: boolean;
};

const defineDefaultTool = <const T extends ToolCatalogEntry>(tool: T) => tool;

/** Built-in UI capabilities keyed by their stable request-context ID. */
export const defaultTools = {
  url_fetch: defineDefaultTool({
    id: "url_fetch",
    title: "URL fetch",
    description: "Fetch a specific public URL with browser-like request behavior.",
    hidden: false,
    enabled: true,
    userConfigurable: true,
  }),
  scheduling: defineDefaultTool({
    id: "scheduling",
    title: "Scheduling",
    description: "Create and inspect recurring agent work from chat.",
    hidden: false,
    enabled: true,
    userConfigurable: true,
  }),
  web_search: defineDefaultTool({
    id: "web_search",
    title: "Web search",
    description: "Search current information with the model provider's hosted tool.",
    hidden: false,
    enabled: true,
    userConfigurable: true,
  }),
  image_generation: defineDefaultTool({
    id: "image_generation",
    title: "Image generation",
    description: "Create images with OpenAI's hosted image tool.",
    hidden: false,
    enabled: true,
    userConfigurable: true,
  }),
  notifications: defineDefaultTool({
    id: "notifications",
    title: "Notifications",
    description: "Send concise alerts through PWA push or the active browser fallback.",
    hidden: false,
    enabled: true,
    userConfigurable: true,
  }),
  code_mode: defineDefaultTool({
    id: "code_mode",
    title: "Code mode",
    description: "Read, edit, search, and execute commands directly on this host machine.",
    hidden: false,
    enabled: false,
    userConfigurable: true,
    dangerous: true,
  }),
} as const;

/** Complete serializable catalog shared by the included UI and native registry. */
export const defaultRegisteredTools = {
  render_chart: defineDefaultTool({
    id: "render_chart",
    title: "Charts",
    description: "Render interactive charts from retrieved data.",
    hidden: false,
    enabled: true,
    userConfigurable: true,
  }),
  tasks: defineDefaultTool({
    id: "tasks",
    title: "Tasks",
    description: "Create, organize, update, and review tasks.",
    hidden: false,
    enabled: true,
    userConfigurable: true,
  }),
  ...defaultTools,
} as const;

export type DefaultToolId = keyof typeof defaultTools;
export type SelectableToolId = DefaultToolId;

export const toolCatalog = Object.values(defaultTools);

export const hiddenMandatoryToolIds = [
  "monty",
  "cache",
  "dashboard",
  "code_interpreter",
] as const;

export function isMandatoryAgentToolId(id: string) {
  return id === "monty" || id === "cache" || id === "code_interpreter" || id.startsWith("dashboard_");
}

export const defaultEnabledToolIds: SelectableToolId[] = toolCatalog
  .filter((tool) => tool.enabled)
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
  // Newly introduced capabilities are enabled once for selections saved before
  // their catalog version. People can still disable them after migration.
  const additions = [
    ...(storedCatalogVersion < 2 ? ["scheduling"] : []),
    ...(storedCatalogVersion < 4 ? ["url_fetch"] : []),
    ...(storedCatalogVersion < 7 ? ["notifications"] : []),
  ];
  return Array.from(new Set([...normalized, ...additions])).filter(
    (id) => !["calculator", "search", ...hiddenMandatoryToolIds].includes(id),
  );
}
