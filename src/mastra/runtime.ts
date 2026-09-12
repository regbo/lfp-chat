import { createLfpChatMastra } from "@/mastra";
import { homeTransactionTools } from "@/host/transaction-tool";
import { homeWindmillTools } from "@/host/windmill-tool";

const globalForMastra = globalThis as typeof globalThis & {
  lfpMastra?: ReturnType<typeof createLfpChatMastra>;
};

export const { mastra, memory, toolCatalog, toolRegistry } = (globalForMastra.lfpMastra ??=
  createLfpChatMastra({
    configureTools: { ...homeTransactionTools, ...homeWindmillTools },
  }));
