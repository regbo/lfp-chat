import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { homeContextApi } from "@/host/home-context-api";
import type { LfpChatToolRegistryOverrides } from "@/mastra/tool-registry";

export const memoryInputSchema = z.object({
  source: z.string().regex(/^[a-z][a-z0-9_-]{0,62}$/).default("mastra"),
  external_id: z.string().trim().min(1).max(500).optional(),
  title: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(12_000),
  occurred_at: z.iso.datetime({ offset: true }).optional(),
});

const memoryOutputSchema = z.object({
  id: z.string().uuid(),
  external_id: z.string(),
  graph_status: z.enum(["queued", "delivered"]),
  created_at: z.string(),
  updated_at: z.string(),
});

export const memoryAddTool = createTool({
  id: "memory_add",
  description:
    "Save a durable household fact when the user asks you to remember it. Use this for shared home facts, preferences, dates, instructions, and decisions. Do not store passwords, tokens, financial credentials, or private personal details.",
  inputSchema: memoryInputSchema,
  outputSchema: memoryOutputSchema,
  execute: async (input) => {
    const { apiKey, apiUrl } = homeContextApi;
    if (!apiKey) throw new Error("The Home memory API is not configured.");
    const response = await fetch(`${apiUrl}/v1/memories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LFP-Context-Key": apiKey,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Home memory API returned ${response.status}: ${detail.slice(0, 500)}`);
    }
    return memoryOutputSchema.parse(await response.json());
  },
});

export const homeMemoryTools: LfpChatToolRegistryOverrides = {};

if (homeContextApi.apiKey) {
  homeMemoryTools.memories = {
    title: "Memories",
    description: "Save durable, searchable household facts.",
    hidden: false,
    enabled: true,
    userConfigurable: false,
    tools: { memory_add: memoryAddTool },
  };
}
