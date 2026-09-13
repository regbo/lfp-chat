import { describe, expect, test } from "bun:test";

import { parseWindmillEmbedViews } from "@/lib/config";

describe("Windmill embed view configuration", () => {
  test("maps one app into the dashboard slot", () => {
    expect(parseWindmillEmbedViews(JSON.stringify([{
      id: "home-console",
      label: "Home",
      appPath: "f/llm_queue/digestions",
      publicSecretFile: "/run/secrets/lfp_chat_windmill_home_console_public_secret",
      placement: "dashboard",
    }]))).toEqual([{
      id: "home-console",
      label: "Home",
      appPath: "f/llm_queue/digestions",
      publicSecretFile: "/run/secrets/lfp_chat_windmill_home_console_public_secret",
      placement: "dashboard",
      href: "/dashboard",
    }]);
  });

  test("gives additional apps independent navigation routes", () => {
    expect(parseWindmillEmbedViews(JSON.stringify([{
      id: "finance",
      label: "Finance",
      appPath: "f/finance/overview",
    }]))[0]).toMatchObject({ placement: "navigation", href: "/finance" });
  });

  test("rejects ambiguous dashboard and unsafe app paths", () => {
    expect(() => parseWindmillEmbedViews(JSON.stringify([
      { id: "one", label: "One", appPath: "f/apps/one", placement: "dashboard" },
      { id: "two", label: "Two", appPath: "f/apps/two", placement: "dashboard" },
    ]))).toThrow("only once");
    expect(() => parseWindmillEmbedViews(JSON.stringify([
      { id: "bad", label: "Bad", appPath: "u/admin/private" },
    ]))).toThrow("folder appPath");
    expect(() => parseWindmillEmbedViews(JSON.stringify([
      { id: "bad", label: "Bad", appPath: "f/apps/private", publicSecretFile: "C:\\secret" },
    ]))).toThrow("Swarm secret");
  });
});
