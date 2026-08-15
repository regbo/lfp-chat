import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { optionalHttpUrl, secretValue } from "@/lib/config";
import type { LfpChatToolRegistryOverrides } from "@/mastra/tool-registry";

const decimalSchema = z.union([z.number(), z.string().trim().min(1)]);
const timestampSchema = z.iso.datetime({ offset: true });
const homeContextApi = {
  apiUrl: optionalHttpUrl("LFP_HOME_CONTEXT_API_URL") || "http://lfp-home-context-api:8001",
  apiKey: secretValue("LFP_HOME_CONTEXT_API_KEY", "LFP_HOME_CONTEXT_API_KEY_FILE"),
};

export const transactionInputSchema = z.object({
  source: z.string().regex(/^[a-z][a-z0-9_-]{0,62}$/).default("mastra"),
  account: z.object({
    external_id: z.string().trim().min(1).max(250).optional(),
    name: z.string().trim().min(1).max(250),
    institution_name: z.string().trim().max(250).optional(),
    last4: z.string().regex(/^[0-9A-Za-z]{2,8}$/).optional(),
    currency: z.string().regex(/^[A-Za-z]{3}$/).default("USD"),
    balance: decimalSchema.optional(),
    available_balance: decimalSchema.optional(),
    balance_at: timestampSchema.optional(),
  }),
  transactions: z.array(z.object({
    external_id: z.string().trim().min(1).max(500).optional(),
    posted_at: timestampSchema,
    transacted_at: timestampSchema.optional(),
    amount: decimalSchema,
    description: z.string().trim().min(1).max(1_000),
    payee: z.string().trim().max(500).optional(),
    memo: z.string().trim().max(2_000).optional(),
    reference: z.string().trim().max(500).optional(),
    pending: z.boolean().default(false),
  })).min(1).max(5_000),
});

const transactionOutputSchema = z.object({
  provider: z.string(),
  account_external_id: z.string(),
  submitted: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  transaction_external_ids: z.array(z.string()),
});

export const transactionAddTool = createTool({
  id: "transaction_add",
  description:
    "Add one or more structured financial transactions after the user explicitly asks. The Home API creates an independent account when no external account ID is supplied and safely deduplicates retries. Never invent transaction details or financial credentials.",
  inputSchema: transactionInputSchema,
  outputSchema: transactionOutputSchema,
  execute: async (input) => {
    const { apiKey, apiUrl } = homeContextApi;
    if (!apiKey) throw new Error("The Home transaction API is not configured.");
    const response = await fetch(`${apiUrl}/v1/finance/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LFP-Context-Key": apiKey,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Home transaction API returned ${response.status}: ${detail.slice(0, 500)}`);
    }
    return transactionOutputSchema.parse(await response.json());
  },
});

export const homeTransactionTools: LfpChatToolRegistryOverrides = {};

if (homeContextApi.apiKey) {
  homeTransactionTools.transactions = {
    title: "Transactions",
    description: "Add structured, deduplicated transactions to the Home ledger.",
    hidden: false,
    enabled: true,
    userConfigurable: false,
    tools: { transaction_add: transactionAddTool },
  };
}
