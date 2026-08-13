import { describe, expect, test } from "bun:test";

import { resolveUserScope, type UserScopeConfig } from "@/lib/user-scope";

const headerConfig = {
  mode: "header",
  header: "x-authentik-uid",
  nameHeader: "x-authentik-name",
  emailHeader: "x-authentik-email",
  jwtHeader: "authorization",
  jwtClaim: "sub",
  jwtNameClaim: "name",
  jwtEmailClaim: "email",
  jwtJwksUrl: undefined,
  jwtIssuer: undefined,
  jwtAudience: undefined,
} satisfies UserScopeConfig;

describe("resolveUserScope", () => {
  test("derives a stable opaque scope from trusted identity headers", async () => {
    const headers = new Headers({
      "x-authentik-uid": "authentik-user-id",
      "x-authentik-name": "Home User",
      "x-authentik-email": "home@example.com",
    });
    const first = await resolveUserScope(headers, undefined, headerConfig);
    const second = await resolveUserScope(headers, undefined, headerConfig);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.scope).toEqual(second.scope);
    expect(first.scope.resourceId).toMatch(/^user-[A-Za-z0-9_-]{43}$/);
    expect(first.scope.resourceId).not.toContain("authentik-user-id");
    expect(first.scope.displayName).toBe("Home User");
  });

  test("rejects a client scope that differs from the authenticated user", async () => {
    const result = await resolveUserScope(
      new Headers({ "x-authentik-uid": "authentik-user-id" }),
      "another-user",
      headerConfig,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  test("keeps browser-generated ids available in local mode", async () => {
    const result = await resolveUserScope(new Headers(), "local-test", {
      ...headerConfig,
      mode: "local",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.scope.resourceId).toBe("local-test");
  });
});
