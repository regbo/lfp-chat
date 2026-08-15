import { describe, expect, test } from "bun:test";
import { readableError } from "./readable-error";

describe("readableError", () => {
  test("extracts the useful cause from a nested MCP error", () => {
    expect(
      readableError({
        name: "Error",
        cause: { message: "Schema lookup failed." },
        domain: "MCP",
      }),
    ).toBe("Schema lookup failed.");
  });

  test("parses a serialized nested tool error", () => {
    expect(
      readableError({
        errorMessage: JSON.stringify({ message: "Tool execution failed." }),
      }),
    ).toBe("Tool execution failed.");
  });

  test("does not expose an unknown object as raw JSON", () => {
    expect(readableError({ domain: "MCP", metadata: { private: true } })).toBe(
      "An unexpected error occurred.",
    );
  });
});
