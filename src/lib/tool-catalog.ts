export const TOOLS_CONTEXT_KEY = "lfp.tools";

export const toolCatalog = [
  {
    id: "search",
    title: "Project search",
    description: "Search the app's built-in project knowledge.",
    defaultEnabled: true,
  },
  {
    id: "calculator",
    title: "Calculator",
    description: "Run reliable basic arithmetic.",
    defaultEnabled: true,
  },
  {
    id: "monty",
    title: "Monty",
    description: "Execute Python in an isolated, resource-limited worker.",
    defaultEnabled: true,
  },
  {
    id: "family_sql",
    title: "Family SQL",
    description: "Generate and run read-only SQL over ingested family context.",
    defaultEnabled: true,
  },
  {
    id: "family_graph",
    title: "Family graph",
    description: "Search Graphiti for temporal family facts and relationships.",
    defaultEnabled: true,
  },
  {
    id: "family_email",
    title: "Family email",
    description: "Retrieve original emails and inspect parsed MIME content.",
    defaultEnabled: true,
  },
  {
    id: "family_attachment",
    title: "Family attachment",
    description: "Retrieve attachment text, labels, metadata, or original bytes.",
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

const selectableToolIds = new Set<string>(toolCatalog.map((tool) => tool.id));

export const defaultEnabledToolIds: SelectableToolId[] = toolCatalog
  .filter((tool) => tool.defaultEnabled)
  .map((tool) => tool.id);

export function normalizeEnabledToolIds(value: unknown): SelectableToolId[] {
  if (!Array.isArray(value)) return [...defaultEnabledToolIds];
  return Array.from(
    new Set(
      value.filter(
        (id): id is SelectableToolId =>
          typeof id === "string" && selectableToolIds.has(id),
      ),
    ),
  );
}
