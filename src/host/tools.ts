import { homeEmailTools } from "@/host/email-tool";
import { homeTransactionTools } from "@/host/transaction-tool";
import type { LfpChatToolRegistryOverrides } from "@/mastra/tool-registry";

export const homeHostTools: LfpChatToolRegistryOverrides = {
  ...homeTransactionTools,
  ...homeEmailTools,
};
