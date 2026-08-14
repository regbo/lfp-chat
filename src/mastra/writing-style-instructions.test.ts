import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { DEFAULT_WRITING_STYLE_INSTRUCTIONS } from "@/mastra/writing-style-instructions";

describe("default writing style instructions", () => {
  test("stay synchronized with the LLM writing guide", async () => {
    const guide = await readFile(
      new URL("../../docs/llm/WRITING_STYLE_INSTRUCTIONS.md", import.meta.url),
      "utf8",
    );
    const promptBlock = guide.match(/```text\r?\n([\s\S]*?)\r?\n```/)?.[1];

    expect(promptBlock).toBeDefined();
    expect(DEFAULT_WRITING_STYLE_INSTRUCTIONS).toBe(promptBlock!);
  });
});
