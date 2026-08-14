export const DEFAULT_STARTER_SUGGESTIONS = [
  "What needs my attention today?",
  "Help me pick up where I left off.",
  "What would be useful to work on next?",
] as const;

const MAX_CONTEXT_TITLES = 8;
const MAX_TITLE_LENGTH = 120;
const MAX_SUGGESTION_LENGTH = 100;

export function normalizeStarterTitles(titles: readonly string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of titles) {
    const title = value.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_LENGTH);
    const key = title.toLocaleLowerCase();
    if (!title || key === "new chat" || seen.has(key)) continue;
    seen.add(key);
    normalized.push(title);
    if (normalized.length === MAX_CONTEXT_TITLES) break;
  }
  return normalized;
}

export function starterSuggestionSignature(titles: readonly string[]) {
  return normalizeStarterTitles(titles)
    .map((title) => title.toLocaleLowerCase())
    .sort()
    .join("\n");
}

export function fallbackStarterSuggestions(titles: readonly string[]) {
  const recent = normalizeStarterTitles(titles);
  if (recent.length === 0) return [...DEFAULT_STARTER_SUGGESTIONS];

  return [
    `Catch me up on “${recent[0]}”.`,
    recent[1]
      ? `What should I follow up on from “${recent[1]}”?`
      : `What should I follow up on from “${recent[0]}”?`,
    "What needs my attention today?",
  ];
}

export function normalizeStarterSuggestions(
  values: readonly string[],
  fallback: readonly string[],
) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of [...values, ...fallback]) {
    const suggestion = value.trim().replace(/\s+/g, " ").slice(0, MAX_SUGGESTION_LENGTH);
    const key = suggestion.toLocaleLowerCase();
    if (!suggestion || seen.has(key)) continue;
    seen.add(key);
    normalized.push(suggestion);
    if (normalized.length === 3) break;
  }
  return normalized;
}
