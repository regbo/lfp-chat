"use client";

import { MastraClient } from "@mastra/client-js";

/**
 * AgentController owns session streaming, replay, reconnects, and aborts.
 * Keeping one stock browser client avoids a parallel transport lifecycle.
 */
export const browserMastraClient = new MastraClient({
  baseUrl: typeof window === "undefined" ? "http://localhost" : window.location.origin,
  apiPrefix: "/api/mastra",
  retries: 2,
  backoffMs: 250,
  maxBackoffMs: 1_000,
});
