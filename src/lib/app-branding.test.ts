import { describe, expect, test } from "bun:test";

import { createAppBranding, DEFAULT_APP_BRANDING } from "./app-branding";

describe("app branding", () => {
  test("uses the chat product by default", () => {
    expect(DEFAULT_APP_BRANDING).toEqual({
      fullName: "LFP Chat",
      shortName: "chat",
      faviconUrl: "/lfp-icon.svg",
      displayName: "LFP Chat",
      productName: "chat",
    });
  });

  test("normalizes a host product name", () => {
    expect(createAppBranding(" Portal ")).toEqual({
      fullName: "LFP Portal",
      shortName: "portal",
      faviconUrl: "/lfp-icon.svg",
      displayName: "LFP Portal",
      productName: "portal",
    });
  });

  test("supports a distinct full name and favicon", () => {
    expect(createAppBranding({
      shortName: "portal",
      fullName: "Example Portal",
      faviconUrl: "/example.svg",
    })).toMatchObject({
      shortName: "portal",
      fullName: "Example Portal",
      faviconUrl: "/example.svg",
    });
  });

  test("rejects names that cannot form a compact product lockup", () => {
    expect(() => createAppBranding("portal/finance")).toThrow("APP_SHORT_NAME");
  });
});
