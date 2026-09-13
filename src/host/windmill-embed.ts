import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { importPKCS8, SignJWT } from "jose";

import { windmillApi } from "@/host/windmill-api";
import { serverConfig, type WindmillEmbedViewConfig } from "@/lib/config";
import type { UserScope } from "@/lib/user-scope";

const PUBLIC_SECRET_TTL_MS = 5 * 60_000;
const GUEST_TOKEN_TTL_SECONDS = 5 * 60;

type CachedSecret = { value: string; expiresAt: number };

const publicSecrets = new Map<string, CachedSecret>();
const signingKeys = new Map<string, Promise<CryptoKey>>();

function encodedPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function windmillGuestEmail(user: UserScope) {
  const identity = createHash("sha256")
    .update(`lfp-chat-windmill\0${user.resourceId}`)
    .digest("hex")
    .slice(0, 24);
  return `lfp-chat-${identity}@guest.lfpconnect.internal`;
}

async function guestSigningKey(privateKey: string) {
  const id = createHash("sha256").update(privateKey).digest("base64url");
  let key = signingKeys.get(id);
  if (!key) {
    key = importPKCS8(privateKey, "RS256");
    signingKeys.set(id, key);
  }
  return await key;
}

async function publicSecret(
  view: WindmillEmbedViewConfig,
  fetchImpl: typeof fetch,
  readSecretFile: (path: string) => Promise<string>,
  now: number,
  api: typeof windmillApi,
) {
  const cacheKey = view.publicSecretFile ?? `${api.apiUrl}\0${api.workspace}\0${view.appPath}`;
  const cached = publicSecrets.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;
  let value: string;
  if (view.publicSecretFile) {
    value = (await readSecretFile(view.publicSecretFile)).trim();
  } else {
    if (!api.token) throw new Error("The Windmill API is not configured.");
    const target = new URL(
      `/api/w/${encodeURIComponent(api.workspace)}/apps/secret_of/${encodedPath(view.appPath)}`,
      api.apiUrl,
    );
    const response = await fetchImpl(target, {
      headers: { Authorization: `Bearer ${api.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Windmill app lookup returned ${response.status}.`);
    }
    value = (await response.text()).trim().replace(/^"|"$/g, "");
  }
  if (!/^[a-zA-Z0-9_-]{8,}$/.test(value)) {
    throw new Error("Windmill returned an invalid app secret.");
  }
  publicSecrets.set(cacheKey, { value, expiresAt: now + PUBLIC_SECRET_TTL_MS });
  return value;
}

export function findWindmillEmbedView(id: string) {
  return serverConfig.windmillEmbedViews.find((view) => view.id === id);
}

/** Mint a short-lived guest grant constrained by Windmill to one configured app. */
export async function windmillGuestAppUrl(
  view: WindmillEmbedViewConfig,
  user: UserScope,
  options: {
    api?: typeof windmillApi;
    fetchImpl?: typeof fetch;
    now?: number;
    privateKey?: string;
    readSecretFile?: (path: string) => Promise<string>;
  } = {},
) {
  const api = options.api ?? windmillApi;
  const privateKey = options.privateKey ?? serverConfig.windmillGuestPrivateKey;
  if (!privateKey) throw new Error("Windmill guest app signing is not configured.");
  const now = options.now ?? Date.now();
  const [secret, key] = await Promise.all([
    publicSecret(
      view,
      options.fetchImpl ?? fetch,
      options.readSecretFile ?? ((path) => readFile(path, "utf8")),
      now,
      api,
    ),
    guestSigningKey(privateKey),
  ]);
  const issuedAt = Math.floor(now / 1_000);
  const token = await new SignJWT({
    email: windmillGuestEmail(user),
    workspace_id: api.workspace,
    app_path: view.appPath,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + GUEST_TOKEN_TTL_SECONDS)
    .sign(key);
  return new URL(
    `/public/${encodeURIComponent(api.workspace)}/${encodeURIComponent(secret)}/guest.${token}`,
    api.apiUrl,
  );
}
