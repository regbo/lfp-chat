import { describe, expect, test } from "bun:test";

import {
  createModelCatalog,
  modelSelectionForControllerMode,
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

  test("includes ChatGPT subscription models as normal controller models", () => {
    const catalog = createModelCatalog(
      "openai",
      "openai/gpt-5.6-luna",
      "medium",
      ["gpt-5.6-luna"],
      [],
      [
        {
          provider: "subscription/chatgpt",
          modelNames: ["gpt-5.4", "gpt-5.3-codex"],
          description: "Subscription model.",
        },
      ],
    );

    expect(
      catalog.models.map((model) => ({
        id: model.id,
        description: model.description,
      })),
    ).toContainEqual({
      id: "subscription/chatgpt/gpt-5.4",
      description: "Subscription model.",
    });
  });
});

describe("controller mode selection", () => {
  const catalog = createModelCatalog(
    "openai",
    "openai/gpt-5.6-luna",
    "medium",
    ["gpt-5.6-luna"],
    [],
    [
      {
        provider: "subscription/chatgpt",
        modelNames: ["gpt-5.6-sol"],
        description: "Subscription model.",
      },
    ],
  );

  test("selects the LiteLLM subscription model in code mode", () => {
    expect(
      modelSelectionForControllerMode(catalog, catalog.defaultSelection, "code"),
    ).toEqual({
      agentId: "chatAgent",
      modelId: "subscription/chatgpt/gpt-5.6-sol",
      reasoningEffort: "medium",
    });
  });

  test("keeps an explicit model when leaving code mode", () => {
    expect(
      modelSelectionForControllerMode(
        catalog,
        catalog.defaultSelection,
        "chat",
      ),
    ).toEqual(catalog.defaultSelection);
  });
});
