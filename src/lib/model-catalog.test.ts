import { describe, expect, test } from "bun:test";

import {
  CODEX_CHAT_AGENT_ID,
  createAgentCatalog,
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
});

describe("controller agent selection", () => {
  const catalog = createModelCatalog(
    "openai",
    "openai/gpt-5.6-luna",
    "medium",
    ["gpt-5.6-luna"],
    createAgentCatalog(true),
  );

  test("selects Codex when the controller enters code mode", () => {
    expect(
      modelSelectionForControllerMode(catalog, catalog.defaultSelection, "code")
        .agentId,
    ).toBe(CODEX_CHAT_AGENT_ID);
  });

  test("returns to the standard agent when leaving code mode", () => {
    expect(
      modelSelectionForControllerMode(
        catalog,
        { ...catalog.defaultSelection, agentId: CODEX_CHAT_AGENT_ID },
        "chat",
      ),
    ).toEqual(catalog.defaultSelection);
  });
});
