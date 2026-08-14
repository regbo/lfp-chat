import { z } from "zod";

import { starterSuggestionSignature } from "@/lib/starter-suggestions";
import { generateStarterSuggestions } from "@/mastra/starter-suggestions";
import { resolveUserScope } from "@/lib/user-scope";

export const runtime = "nodejs";

const requestSchema = z.object({
  resourceId: z.string().trim().min(1).max(300),
  recentTitles: z.array(z.string().max(300)).max(20).default([]),
});

const GENERATED_TTL_MS = 12 * 60 * 60 * 1_000;
const FALLBACK_TTL_MS = 30 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 500;

type CachedSuggestions = {
  expiresAt: number;
  generated: boolean;
  suggestions: string[];
};

const globalForSuggestions = globalThis as typeof globalThis & {
  lfpStarterSuggestionCache?: Map<string, CachedSuggestions>;
  lfpStarterSuggestionRequests?: Map<string, Promise<CachedSuggestions>>;
};

const suggestionCache = globalForSuggestions.lfpStarterSuggestionCache ??= new Map();
const suggestionRequests = globalForSuggestions.lfpStarterSuggestionRequests ??= new Map();

function pruneSuggestionCache(now: number) {
  for (const [key, value] of suggestionCache) {
    if (value.expiresAt <= now) suggestionCache.delete(key);
  }
  while (suggestionCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = suggestionCache.keys().next().value;
    if (!oldest) break;
    suggestionCache.delete(oldest);
  }
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid suggestion request." }, { status: 400 });
  }

  const resolved = await resolveUserScope(request.headers, parsed.data.resourceId);
  if (!resolved.ok) return resolved.response;

  const signature = starterSuggestionSignature(parsed.data.recentTitles);
  const key = `${resolved.scope.resourceId}\n${signature}`;
  const now = Date.now();
  pruneSuggestionCache(now);
  const cached = suggestionCache.get(key);
  if (cached && cached.expiresAt > now) {
    return Response.json({ ...cached, ttlMs: cached.expiresAt - now });
  }

  let pending = suggestionRequests.get(key);
  if (!pending) {
    pending = generateStarterSuggestions(parsed.data.recentTitles)
      .then(({ suggestions, generated }) => {
        const ttlMs = generated ? GENERATED_TTL_MS : FALLBACK_TTL_MS;
        const value = { suggestions, generated, expiresAt: Date.now() + ttlMs };
        suggestionCache.set(key, value);
        return value;
      })
      .finally(() => suggestionRequests.delete(key));
    suggestionRequests.set(key, pending);
  }

  const result = await pending;
  return Response.json({ ...result, ttlMs: result.expiresAt - Date.now() });
}
