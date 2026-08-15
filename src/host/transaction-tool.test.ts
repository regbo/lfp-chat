import { describe, expect, test } from "bun:test";

import { transactionInputSchema } from "@/host/transaction-tool";

describe("transaction_add schema", () => {
  test("defaults source, currency, and pending without changing decimal strings", () => {
    const input = transactionInputSchema.parse({
      account: { name: "Cash" },
      transactions: [{
        posted_at: "2026-08-15T12:00:00-04:00",
        amount: "-18.42",
        description: "Corner market",
      }],
    });

    expect(input.source).toBe("mastra");
    expect(input.account.currency).toBe("USD");
    expect(input.transactions[0]?.pending).toBe(false);
    expect(input.transactions[0]?.amount).toBe("-18.42");
  });

  test("requires timezone-aware transaction timestamps", () => {
    expect(() => transactionInputSchema.parse({
      account: { name: "Cash" },
      transactions: [{
        posted_at: "2026-08-15T12:00:00",
        amount: -18.42,
        description: "Corner market",
      }],
    })).toThrow();
  });
});
