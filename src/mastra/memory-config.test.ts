import { describe, expect, test } from "bun:test";

import { createLfpChatMastra } from "@/mastra";

describe("Mastra memory", () => {
  test("uses observational memory without a main-agent working-memory tool", () => {
    const { memory } = createLfpChatMastra();
    const config = memory.getMergedThreadConfig();

    expect(config.workingMemory).toMatchObject({
      enabled: true,
      scope: "resource",
      agentManaged: false,
      useStateSignals: true,
    });
    expect(config.observationalMemory).toMatchObject({
      enabled: true,
      model: "openai/gpt-5.6-luna",
      scope: "thread",
      observation: { manageWorkingMemory: true },
    });
    expect(memory.listTools()).not.toHaveProperty("updateWorkingMemory");
    expect(memory.listTools()).not.toHaveProperty("setWorkingMemory");
  });
});
