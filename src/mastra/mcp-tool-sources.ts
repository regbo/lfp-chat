import { MCPClient } from "@mastra/mcp";

import { serverConfig } from "@/lib/config";
import type { LfpChatToolRegistry } from "@/mastra/tool-registry";

const sources = serverConfig.mcpToolSources.filter(
  (source) => source.enabled || source.userConfigurable,
);

const client = sources.length
  ? new MCPClient({
      id: "lfp-chat-configured-tool-sources",
      servers: Object.fromEntries(
        sources.map((source) => [
          source.id,
          {
            url: new URL(source.url),
            timeout: source.timeoutMs,
            forwardInstructions: source.forwardInstructions,
            requestInit: source.authToken
              ? { headers: { Authorization: `Bearer ${source.authToken}` } }
              : undefined,
          },
        ]),
      ),
    })
  : undefined;

/** Resolve configured MCP tools lazily so a failed optional source cannot stop Chat startup. */
export async function configuredMcpTools(
  enabledCapabilities: Set<string>,
  toolRegistry?: LfpChatToolRegistry,
) {
  if (!client) return {};
  const enabledSources = sources.filter(
    (source) => source.userConfigurable
      ? enabledCapabilities.has(source.id)
      : source.enabled,
  );
  if (!enabledSources.length) return {};
  const { tools, errors } = await client.listToolsWithErrors();
  for (const source of enabledSources) {
    const error = errors[source.id];
    if (error) console.warn(`MCP tool source ${source.id} is unavailable:`, error);
  }
  const prefixes = enabledSources.map((source) => `${source.id}_`);
  const enabledTools = Object.fromEntries(
    Object.entries(tools).filter(([toolId]) =>
      prefixes.some((prefix) => toolId.startsWith(prefix)),
    ),
  );
  if (toolRegistry) {
    for (const source of enabledSources) {
      const sourceTools = Object.fromEntries(
        Object.entries(enabledTools).filter(([toolId]) =>
          toolId.startsWith(`${source.id}_`),
        ),
      );
      toolRegistry.configureTools({ [source.id]: {
        tools: sourceTools,
      } });
    }
    return enabledTools;
  }
  return enabledTools;
}
