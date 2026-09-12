import { describe, expect, test } from "bun:test";

import {
  createModelCatalog,
  mostPowerfulModelSelection,
} from "./model-catalog";

describe("most powerful model selection", () => {
  test("prefers Sol with the highest supported reasoning effort", () => {
    const catalog = createModelCatalog(
      "openai",
      "openai/gpt-5.6-luna",
      "medium",
      ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"],
    );

    expect(mostPowerfulModelSelection(catalog)).toEqual({
      agentId: "chatAgent",
      modelId: "openai/gpt-5.6-sol",
      reasoningEffort: "max",
    });
  });

  test("keeps LiteLLM ChatGPT models selectable and preserves their namespace", () => {
    const catalog = createModelCatalog(
      "openai",
      "openai/chatgpt/gpt-5.6-luna",
      "medium",
      ["chatgpt/gpt-5.6-luna", "openai/gpt-5.4", "ollama/qwen3.5:9b"],
    );

    expect(catalog.models.map((model) => model.id)).toEqual([
      "openai/chatgpt/gpt-5.6-luna",
    ]);
    expect(catalog.models[0]).toMatchObject({
      label: "GPT-5.6 Luna",
      reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
      defaultReasoningEffort: "medium",
    });
  });
});
