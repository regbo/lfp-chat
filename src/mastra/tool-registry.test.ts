import { describe, expect, test } from "bun:test";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { createToolRegistry } from "@/mastra/tool-registry";

const lookupTool = createTool({
  id: "home_lookup",
  description: "Look up typed home data.",
  inputSchema: z.object({ accountId: z.string().min(1) }),
  outputSchema: z.object({ total: z.number() }),
  execute: async () => ({ total: 42 }),
});

describe("shared tool registry", () => {
  test("adds a native Mastra tool with sensible UI defaults", () => {
    const registry = createToolRegistry().configureTools({
      home_lookup: lookupTool,
    });

    expect(registry.mastraTools().home_lookup).toBe(lookupTool);
    expect(registry.uiCatalog().find((entry) => entry.id === "home_lookup"))
      .toMatchObject({
        description: "Look up typed home data.",
        enabled: true,
        hidden: false,
        userConfigurable: true,
      });
  });

  test("updates defaults and exposes requested native tools to Monty", () => {
    const registry = createToolRegistry().configureTools({
      url_fetch: { enabled: false, userConfigurable: false },
      home_data: {
        title: "Home data",
        tools: { home_lookup: lookupTool },
        availableToMonty: ["home_lookup"],
      },
    });

    expect(registry.uiCatalog().find((entry) => entry.id === "url_fetch"))
      .toMatchObject({ enabled: false, userConfigurable: false });
    expect(registry.montyTools().home_lookup).toBe(lookupTool);
    expect(registry.mastraTools().home_lookup?.inputSchema).toBe(lookupTool.inputSchema);
    expect(registry.mastraTools().home_lookup?.outputSchema).toBe(lookupTool.outputSchema);
  });

  test("attaches discovered tools to a configured source without losing UI policy", () => {
    const registry = createToolRegistry().configureTools({
      home_data: {
        title: "Home data",
        description: "Managed household data.",
        enabled: true,
        hidden: false,
        userConfigurable: false,
        tools: {},
      },
    });
    registry.configureTools({
      home_data: {
        tools: { home_lookup: lookupTool },
        availableToMonty: ["home_lookup"],
      },
    });

    expect(registry.uiCatalog().find((entry) => entry.id === "home_data"))
      .toMatchObject({ enabled: true, hidden: false, userConfigurable: false });
    expect(registry.montyTools().home_lookup).toBe(lookupTool);
  });
});
