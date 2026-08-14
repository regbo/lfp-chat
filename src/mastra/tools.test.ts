import { describe, expect, test } from "bun:test";

import { FAMILY_DATABASE_DESCRIPTION } from "@/mastra/tools";

describe("family database tool contract", () => {
  test("publishes the complete financial schema to the agent", () => {
    for (const table of [
      "financial_connections",
      "financial_accounts",
      "financial_transactions",
      "financial_sync_runs",
    ]) {
      expect(FAMILY_DATABASE_DESCRIPTION).toContain(table);
    }
    expect(FAMILY_DATABASE_DESCRIPTION).toContain("raw_data JSONB");
    expect(FAMILY_DATABASE_DESCRIPTION).toContain("provider's signed values");
  });
});
