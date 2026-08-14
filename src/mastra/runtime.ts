import { createLfpChatMastra } from "@/mastra";

const globalForMastra = globalThis as typeof globalThis & {
  lfpMastra?: ReturnType<typeof createLfpChatMastra>;
};

export const { mastra, memory } = (globalForMastra.lfpMastra ??=
  createLfpChatMastra());
