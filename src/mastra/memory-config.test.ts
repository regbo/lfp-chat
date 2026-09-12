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
      observation: {
        bufferTokens: 0.2,
        blockAfter: Number.MAX_SAFE_INTEGER,
        manageWorkingMemory: true,
      },
      reflection: {
        bufferActivation: 0.5,
        blockAfter: Number.MAX_SAFE_INTEGER,
      },
    });
    expect(memory.listTools()).not.toHaveProperty("updateWorkingMemory");
    expect(memory.listTools()).not.toHaveProperty("setWorkingMemory");
  });
});
