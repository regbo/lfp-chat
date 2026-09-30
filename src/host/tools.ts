import { homeEmailTools } from "@/host/email-tool";
import { homeTransactionTools } from "@/host/transaction-tool";
import type { LfpChatToolRegistryOverrides } from "@/mastra/tool-registry";

export const homeHostTools: LfpChatToolRegistryOverrides = {
  ...homeTransactionTools,
  ...homeEmailTools,
};

export const homeHostToolCatalog = Object.entries(homeHostTools).flatMap(
  ([id, value]) => {
    if (!("tools" in value)) return [];
    return [{
      id,
      title: value.title ?? id,
      description: value.description ?? id,
      hidden: value.hidden ?? false,
      enabled: value.enabled ?? true,
      userConfigurable: value.userConfigurable ?? true,
    }];
  },
);
