import { describe, expect, test } from "bun:test";
import { validateChatAppPlugins, type ChatAppPlugin } from "./chat-app-plugins";

const plugin = (id: string, label = id): ChatAppPlugin => ({
  content: null,
  id,
  label,
});

describe("validateChatAppPlugins", () => {
  test("preserves a valid registration list", () => {
    const plugins = [plugin("dashboard"), plugin("todos")];
    expect(validateChatAppPlugins(plugins)).toBe(plugins);
  });

  test("rejects ids that would make registration ambiguous", () => {
    expect(() => validateChatAppPlugins([plugin("dashboard"), plugin("dashboard")]))
      .toThrow('ChatApp plugin id "dashboard" is registered more than once.');
    expect(() => validateChatAppPlugins([plugin(" ")]))
      .toThrow("ChatApp plugin ids must not be empty.");
  });

  test("rejects menu items without a visible label", () => {
    expect(() => validateChatAppPlugins([plugin("dashboard", " ")]))
      .toThrow('ChatApp plugin "dashboard" must have a label.');
  });
});
