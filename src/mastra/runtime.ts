import { createLfpChatMastra } from "@/mastra";
import { homeHostTools } from "@/host/tools";

const globalForMastra = globalThis as typeof globalThis & {
  lfpMastra?: ReturnType<typeof createLfpChatMastra>;
};

export const { agentController, mastra, memory, toolCatalog, toolRegistry } = (globalForMastra.lfpMastra ??=
  createLfpChatMastra({
    configureTools: homeHostTools,
  }));
