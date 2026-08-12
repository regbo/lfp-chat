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
});
