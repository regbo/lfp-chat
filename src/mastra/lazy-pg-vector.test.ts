import { describe, expect, mock, test } from "bun:test";

import { LazyExtensionPgVector } from "@/mastra/lazy-pg-vector";

describe("LazyExtensionPgVector", () => {
  test("creates pgvector once before delegating index creation", async () => {
    const vector = new LazyExtensionPgVector({
      id: "test-vectors",
      connectionString: "postgresql://unused:unused@localhost:5432/unused",
    });
    const query = mock(async () => ({ rows: [] }));
    const createIndex = mock(async () => undefined);
    Object.defineProperty(vector, "pool", { value: { query } });
    const prototype = Object.getPrototypeOf(LazyExtensionPgVector.prototype);
    const original = prototype.createIndex;
    prototype.createIndex = createIndex;

    try {
      const args = { indexName: "memory_messages_1024", dimension: 1024 };
      await Promise.all([vector.createIndex(args), vector.createIndex(args)]);

      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith("CREATE EXTENSION IF NOT EXISTS vector");
      expect(createIndex).toHaveBeenCalledTimes(2);
    } finally {
      prototype.createIndex = original;
    }
  });
});
