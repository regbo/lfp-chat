import { describe, expect, test } from "bun:test";

import { createLfpChatMastra } from "@/mastra";

describe("Mastra memory", () => {
  test("uses short resource memory without observational compaction", () => {
    const { memory } = createLfpChatMastra();
    const config = memory.getMergedThreadConfig();

    expect(config.workingMemory).toMatchObject({
      enabled: true,
      scope: "resource",
      agentManaged: false,
      useStateSignals: true,
    });
    expect(config.observationalMemory).toBe(false);
    expect(config.lastMessages).toBe(24);
    expect(config.semanticRecall).toBe(false);
    expect(memory.listTools()).not.toHaveProperty("updateWorkingMemory");
    expect(memory.listTools()).not.toHaveProperty("setWorkingMemory");
  });
});
