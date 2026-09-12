import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { runWindmillScript, windmillApi } from "@/host/windmill-api";
import type { LfpChatToolRegistryOverrides } from "@/mastra/tool-registry";

const digestItemSchema = z.object({
  ingest_id: z.string(),
  subject: z.string().nullable(),
  sender_name: z.string().nullable(),
  sender_address: z.string().nullable(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  sent_at: z.string().nullable(),
  first_seen_at: z.string(),
  gmail_account: z.string().nullable(),
  lane: z.string(),
  body_preview: z.string().nullable(),
  job_id: z.string().nullable(),
  job_state: z.string(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  completed_at: z.string().nullable(),
  sort_at: z.string(),
  summary: z.string(),
  actions: z.array(z.string()),
  dates: z.array(z.string()),
  people: z.array(z.string()),
  facts: z.array(z.string()),
});

const digestionPageSchema = z.object({
  items: z.array(digestItemSchema),
  has_more: z.boolean(),
  next_cursor_at: z.string().nullable(),
  next_cursor_id: z.string().nullable(),
});

const financePageSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  total: z.number().int().nonnegative(),
  next_offset: z.number().int().nonnegative().nullable(),
});

export const windmillDigestionSearchInputSchema = z.object({
  search: z.string().max(500).default(""),
  lane: z.enum(["all", "live", "bulk", "backfill"]).default("all"),
  cursor_at: z.string().default(""),
  cursor_id: z.string().default(""),
  page_size: z.number().int().min(20).max(100).default(40),
});

export const windmillFinanceSearchInputSchema = z.object({
  query: z.string().max(200).default(""),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(50),
});

export const windmillStatusTool = createTool({
  id: "windmill_status",
  description:
    "Read current Windmill ingestion, Together processing, digestion, and vector coverage status.",
  strict: true,
  inputSchema: z.object({}),
  outputSchema: z.record(z.string(), z.unknown()),
  mcp: {
    annotations: {
      title: "Windmill processing status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async (_input, context) =>
    z.record(z.string(), z.unknown()).parse(
      await runWindmillScript(
        "f/llm_queue/get_queue_status",
        {},
        context?.abortSignal,
      ),
    ),
});

export const windmillDigestionSearchTool = createTool({
  id: "windmill_digestion_search",
  description:
    "Search historical processed email digestions and summaries. Prefer search_gmail for current mailbox questions; use this when a generated digestion or processed-only view is specifically needed. Continue with the returned cursor when more results are needed.",
  strict: true,
  inputSchema: windmillDigestionSearchInputSchema,
  outputSchema: digestionPageSchema,
  mcp: {
    annotations: {
      title: "Search processed email digestions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async (input, context) => digestionPageSchema.parse(
    await runWindmillScript(
      "f/llm_queue/list_processed_digestions",
      input,
      context?.abortSignal,
    ),
  ),
});

export const windmillFinanceSearchTool = createTool({
  id: "windmill_finance_search",
  description:
    "Search the processed financial transaction output maintained by Windmill finance flows.",
  strict: true,
  inputSchema: windmillFinanceSearchInputSchema,
  outputSchema: financePageSchema,
  mcp: {
    annotations: {
      title: "Search processed financial transactions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  execute: async (input, context) => financePageSchema.parse(
    await runWindmillScript(
      "f/llm_queue/list_financial_transactions",
      input,
      context?.abortSignal,
    ),
  ),
});

export const homeWindmillTools: LfpChatToolRegistryOverrides = {};

if (windmillApi.token) {
  homeWindmillTools.windmill = {
    title: "Windmill",
    description: "Read processed Home outputs and inspect ingestion health.",
    hidden: false,
    enabled: true,
    userConfigurable: false,
    availableToMonty: [
      "windmill_status",
      "windmill_digestion_search",
      "windmill_finance_search",
    ],
    tools: {
      windmill_status: windmillStatusTool,
      windmill_digestion_search: windmillDigestionSearchTool,
      windmill_finance_search: windmillFinanceSearchTool,
    },
  };
}
