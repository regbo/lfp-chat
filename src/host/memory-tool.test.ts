import { describe, expect, test } from "bun:test";

import { memoryInputSchema } from "@/host/memory-tool";

describe("memory tool", () => {
  test("defaults trusted writes to the Mastra source", () => {
    expect(memoryInputSchema.parse({ title: "Gate", content: "Use the side gate." })).toEqual({
      source: "mastra",
      title: "Gate",
      content: "Use the side gate.",
    });
  });
});
