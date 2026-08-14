import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";

import { createTool } from "@mastra/core/tools";
import { gotScraping } from "got-scraping";
import { z } from "zod";

function isPrivateAddress(address: string) {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;
  if (address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe8") || address.startsWith("fe9") || address.startsWith("fea") || address.startsWith("feb")) return true;
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const value = mapped ?? address;
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

type LookupResult = string | Array<{ address: string; family: number }>;
type LookupCallback = (error: Error | null, address?: LookupResult, family?: number) => void;
type RawLookup = (hostname: string, options: object, callback: (error: Error | null, address: LookupResult, family?: number) => void) => void;

const safeLookup = ((hostname: string, options: object, callback: LookupCallback) => {
  (dnsLookup as unknown as RawLookup)(hostname, options, (error, address, family) => {
    if (error) return callback(error);
    const addresses = Array.isArray(address) ? address.map((item) => item.address) : [address];
    if (addresses.some(isPrivateAddress)) {
      return callback(new Error("url_fetch blocks private, loopback, link-local, and reserved network addresses."));
    }
    callback(null, address, family);
  });
}) as typeof dnsLookup;

export const urlFetchTool = createTool({
  id: "url_fetch",
  description:
    "Fetch one specific public HTTP or HTTPS URL using browser-like headers and TLS behavior. This is not web search. Returns bounded response text and metadata; private network destinations are blocked.",
  inputSchema: z.object({
    url: z.url().max(4_000),
    headers: z.record(z.string(), z.string().max(2_000)).optional(),
  }),
  outputSchema: z.object({
    url: z.string(),
    statusCode: z.number(),
    contentType: z.string(),
    body: z.string(),
    truncated: z.boolean(),
  }),
  execute: async ({ headers, url }) => {
    const parsed = new URL(url);
    if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) {
      throw new Error("url_fetch only supports HTTP and HTTPS URLs.");
    }
    const response = await gotScraping({
      url: parsed,
      headers,
      dnsLookup: safeLookup,
      timeout: { request: 15_000 },
      retry: { limit: 1 },
      followRedirect: true,
      maxRedirects: 5,
      throwHttpErrors: false,
      responseType: "text",
      // Bun's Node compatibility layer currently mis-normalizes HTTP/2 origins.
      // Header generation and TLS/browser fingerprinting remain enabled on HTTP/1.1.
      http2: false,
    });
    const limit = 200_000;
    return {
      url: response.url,
      statusCode: response.statusCode,
      contentType: String(response.headers["content-type"] ?? ""),
      body: response.body.slice(0, limit),
      truncated: response.body.length > limit,
    };
  },
});
