import { Agent } from "@mastra/core/agent";
import { z } from "zod";

import {
  fallbackStarterSuggestions,
  normalizeStarterSuggestions,
  normalizeStarterTitles,
} from "@/lib/starter-suggestions";
import { resolveBackgroundModel } from "@/mastra/model-provider";

const starterSuggestionsSchema = z.object({
  suggestions: z.array(z.string().trim().min(1).max(100)).length(3),
});

const starterSuggestionsAgent = new Agent({
  id: "starterSuggestions",
  name: "Starter suggestions",
  description: "Creates concise prompts for the empty chat screen.",
  model: resolveBackgroundModel(),
  instructions: `Write exactly three short prompts that a person could send to their assistant.

Use only the supplied recent conversation titles. Do not invent details that are not in a title.
- One prompt should help continue or review a recent conversation.
- One prompt should ask for a useful follow-up or next action.
- One prompt may connect recurring topics or ask what deserves attention now.
- Keep each prompt natural, specific, and under 100 characters.
- Do not mention that you were given titles or that you are generating suggestions.`,
});

export async function generateStarterSuggestions(titles: readonly string[]) {
  const recent = normalizeStarterTitles(titles);
  const fallback = fallbackStarterSuggestions(recent);
  if (recent.length === 0) return { suggestions: fallback, generated: false };

  try {
    const response = await starterSuggestionsAgent.generate(
      `Recent conversation titles:\n${recent.map((title) => `- ${title}`).join("\n")}`,
      {
        abortSignal: AbortSignal.timeout(12_000),
        maxSteps: 1,
        modelSettings: { maxOutputTokens: 180, temperature: 0.35 },
        structuredOutput: {
          schema: starterSuggestionsSchema,
          jsonPromptInjection: "auto",
          errorStrategy: "fallback",
          fallbackValue: { suggestions: fallback },
        },
      },
    );
    return {
      suggestions: normalizeStarterSuggestions(response.object?.suggestions ?? [], fallback),
      generated: true,
    };
  } catch {
    return { suggestions: fallback, generated: false };
  }
}
