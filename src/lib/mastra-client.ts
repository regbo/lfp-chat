import "server-only";

import { MastraClient } from "@mastra/client-js";

import { serverConfig } from "@/lib/config";

const globalForMastraClient = globalThis as typeof globalThis & {
  lfpMastraClient?: MastraClient;
};

export const mastraClient =
  globalForMastraClient.lfpMastraClient ??
  (globalForMastraClient.lfpMastraClient = new MastraClient({
    baseUrl: serverConfig.mastraApiUrl,
    retries: 2,
    backoffMs: 250,
    maxBackoffMs: 1_000,
  }));
