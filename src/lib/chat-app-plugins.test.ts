import { describe, expect, test } from "bun:test";
import {
  validateChatAppMods,
  validateChatAppPlugins,
  type ChatAppPlugin,
} from "./chat-app-plugins";

const plugin = (id: string, label = id): ChatAppPlugin => ({
  content: null,
  id,
  label,
});

describe("validateChatAppMods", () => {
  test("accepts routed views, settings, and tool contributions", () => {
    const mods = [{
      id: "home",
      settings: null,
      tools: [{ id: "home_assign", title: "Assignment", description: "Assign work." }],
      views: [plugin("tasks")],
    }];
    expect(validateChatAppMods(mods)).toBe(mods);
  });

  test("rejects duplicate mod and contributed tool ids", () => {
    expect(() => validateChatAppMods([{ id: "home" }, { id: "home" }]))
      .toThrow('ChatApp mod id "home" is registered more than once.');
    expect(() => validateChatAppMods([
      { id: "home", tools: [{ id: "assign", title: "Assign", description: "Assign." }] },
      { id: "work", tools: [{ id: "assign", title: "Assign", description: "Assign." }] },
    ])).toThrow('ChatApp tool id "assign" is registered more than once.');
  });

  test("validates dedicated tool model ids", () => {
    expect(() => validateChatAppMods([{
      id: "home",
      tools: [{
        id: "chart",
        title: "Chart",
        description: "Render a chart.",
        dedicatedModel: { defaultModelId: "not a model" },
      }],
    }])).toThrow('ChatApp tool "chart" has an invalid dedicated model id.');
  });
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

  test("requires a unique non-reserved route", () => {
    expect(() => validateChatAppPlugins([
      { ...plugin("dashboard"), href: "/search" },
    ])).toThrow('ChatApp plugin "dashboard" cannot use reserved route "/search".');
    expect(() => validateChatAppPlugins([
      { ...plugin("dashboard"), href: "/workspace" },
      { ...plugin("todos"), href: "/workspace" },
    ])).toThrow('ChatApp plugin route "/workspace" is registered more than once.');
  });
});
