import { describe, expect, test } from "bun:test";

import {
  fallbackStarterSuggestions,
  normalizeStarterSuggestions,
  normalizeStarterTitles,
  starterSuggestionSignature,
} from "@/lib/starter-suggestions";

describe("starter suggestions", () => {
  test("builds useful fallbacks from recent conversation titles", () => {
    expect(fallbackStarterSuggestions(["Budget planning", "Trip ideas"])).toEqual([
      "Catch me up on “Budget planning”.",
      "What should I follow up on from “Trip ideas”?",
      "What needs my attention today?",
    ]);
  });

  test("normalizes context without regenerating when only order changes", () => {
    expect(normalizeStarterTitles([" New chat ", "Taxes", "taxes", "Home repairs"])).toEqual([
      "Taxes",
      "Home repairs",
    ]);
    expect(starterSuggestionSignature(["Taxes", "Home repairs"])).toBe(
      starterSuggestionSignature(["Home repairs", "Taxes"]),
    );
  });

  test("deduplicates generated prompts and fills missing entries", () => {
    expect(normalizeStarterSuggestions(
      ["Review taxes", " review   taxes "],
      ["Review taxes", "Plan dinner", "Check tasks"],
    )).toEqual(["Review taxes", "Plan dinner", "Check tasks"]);
  });
});
