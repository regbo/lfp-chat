import { createHash } from "node:crypto";

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { serverConfig } from "@/lib/config";

export type UserScope = {
  resourceId: string;
  displayName: string;
  email?: string;
};

export type UserScopeConfig = typeof serverConfig.userScope;

type ScopeResult =
  | { ok: true; scope: UserScope }
  | { ok: false; response: Response };

const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizedValue(value: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function claimValue(payload: JWTPayload, path: string) {
  let value: unknown = payload;
  for (const part of path.split(".")) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === "string" ? normalizedValue(value) : undefined;
}

function scopedResourceId(source: "header" | "jwt", subject: string) {
  const digest = createHash("sha256")
    .update(`${source}\0${subject}`)
    .digest("base64url");
  return `user-${digest}`;
}

function invalidScope(message: string, status = 401): ScopeResult {
  return {
    ok: false,
    response: Response.json({ error: message }, { status }),
  };
}

function enforceClaimedResource(scope: UserScope, claimedResourceId?: string | null) {
  const claimed = normalizedValue(claimedResourceId ?? null);
  if (claimed && claimed !== scope.resourceId) {
    return invalidScope("The requested user scope is not authorized.", 403);
  }
  return { ok: true, scope } as const;
}

function remoteJwks(url: string) {
  let jwks = jwksByUrl.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksByUrl.set(url, jwks);
  }
  return jwks;
}

/**
 * Resolve the durable memory owner from a trusted proxy header or a verified
 * JWT. Local mode deliberately preserves browser-generated development IDs.
 */
export async function resolveUserScope(
  headers: Headers,
  claimedResourceId?: string | null,
  config: UserScopeConfig = serverConfig.userScope,
): Promise<ScopeResult> {
  if (config.mode === "local") {
    const resourceId = normalizedValue(claimedResourceId ?? null);
    if (!resourceId || resourceId.length > 200) {
      return invalidScope("resourceId is required.", 400);
    }
    return {
      ok: true,
      scope: { resourceId, displayName: "Local user" },
    };
  }

  if (config.mode === "header") {
    const subject = normalizedValue(headers.get(config.header));
    if (!subject) {
      return invalidScope(`The trusted identity header ${config.header} is missing.`);
    }
    const email = normalizedValue(headers.get(config.emailHeader));
    const displayName =
      normalizedValue(headers.get(config.nameHeader)) || email || subject;
    return enforceClaimedResource(
      {
        resourceId: scopedResourceId("header", subject),
        displayName,
        ...(email ? { email } : {}),
      },
      claimedResourceId,
    );
  }

  const encoded = normalizedValue(headers.get(config.jwtHeader));
  const token = encoded?.replace(/^Bearer\s+/i, "");
  if (!token || !config.jwtJwksUrl || !config.jwtIssuer) {
    return invalidScope("A verifiable user JWT is required.");
  }
  try {
    const { payload } = await jwtVerify(token, remoteJwks(config.jwtJwksUrl), {
      issuer: config.jwtIssuer,
      ...(config.jwtAudience ? { audience: config.jwtAudience } : {}),
    });
    const subject = claimValue(payload, config.jwtClaim);
    if (!subject) {
      return invalidScope(`The verified JWT has no ${config.jwtClaim} claim.`);
    }
    const email = claimValue(payload, config.jwtEmailClaim);
    const displayName =
      claimValue(payload, config.jwtNameClaim) || email || subject;
    return enforceClaimedResource(
      {
        resourceId: scopedResourceId("jwt", subject),
        displayName,
        ...(email ? { email } : {}),
      },
      claimedResourceId,
    );
  } catch {
    return invalidScope("The user JWT is invalid or expired.");
  }
}

export async function resolvePageUserScope(headers: Headers) {
  if (serverConfig.userScope.mode === "local") return undefined;
  const result = await resolveUserScope(headers);
  return result.ok ? result.scope : undefined;
}
