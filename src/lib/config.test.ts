import { describe, expect, test } from "bun:test";

import { openAiHostedToolsDefault } from "@/lib/config";

describe("hosted OpenAI tool defaults", () => {
  test("enables direct OpenAI and disables compatible proxy endpoints", () => {
    expect(openAiHostedToolsDefault(undefined)).toBe(true);
    expect(openAiHostedToolsDefault("https://api.openai.com/v1")).toBe(true);
    expect(openAiHostedToolsDefault("http://lfp-litellm_proxy:4000/v1")).toBe(false);
    expect(openAiHostedToolsDefault("not a URL")).toBe(false);
  });
});
