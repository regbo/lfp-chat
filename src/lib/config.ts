import { readFileSync } from "node:fs";

import { createAppBranding } from "@/lib/app-branding";

const LOCAL_DATABASE_URL =
  "postgresql://mastra:mastra@localhost:5432/mastra";

const LOCAL_MASTRA_API_URL = "http://127.0.0.1:4111";
const DEFAULT_MODEL_PROVIDER = "openai";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const DEFAULT_CODEX_AGENT_MODE = "agent";
const DEFAULT_USER_SCOPE_MODE = "local";

function boundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function booleanValue(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new Error(`${name} must be true or false.`);
}

export function secretValue(valueName: string, fileName: string) {
  const file = process.env[fileName]?.trim();
  if (file) {
    const value = readFileSync(file, "utf8").trim();
    if (!value) throw new Error(`${fileName} is empty: ${file}`);
    return value;
  }
  return process.env[valueName]?.trim();
}

const codexAgentMode =
  process.env.CODEX_AGENT_MODE?.trim().toLowerCase() || DEFAULT_CODEX_AGENT_MODE;

if (!["read-only", "agent"].includes(codexAgentMode)) {
  throw new Error(
    `Invalid CODEX_AGENT_MODE: ${codexAgentMode}. Use read-only or agent.`,
  );
}

const modelProvider =
  process.env.MODEL_PROVIDER?.trim().toLowerCase() || DEFAULT_MODEL_PROVIDER;
const modelName =
  process.env.MODEL_NAME?.trim() ||
  (modelProvider === "openai" ? process.env.OPENAI_MODEL?.trim() : undefined) ||
  (modelProvider === "openai" ? DEFAULT_OPENAI_MODEL : undefined);

if (!/^[a-z0-9][a-z0-9._-]*$/.test(modelProvider)) {
  throw new Error(`Invalid MODEL_PROVIDER: ${modelProvider}`);
}

if (!modelName) {
  throw new Error(
    `MODEL_NAME is required when MODEL_PROVIDER is ${modelProvider}.`,
  );
}

const userScopeMode =
  process.env.USER_SCOPE_MODE?.trim().toLowerCase() || DEFAULT_USER_SCOPE_MODE;

if (!["local", "header", "jwt"].includes(userScopeMode)) {
  throw new Error(
    `Invalid USER_SCOPE_MODE: ${userScopeMode}. Use local, header, or jwt.`,
  );
}

const appBranding = createAppBranding({
  shortName:
    process.env.APP_SHORT_NAME?.trim() ||
    process.env.APP_NAME?.trim() ||
    "chat",
  fullName: process.env.APP_FULL_NAME?.trim(),
  faviconUrl: process.env.APP_FAVICON_URL?.trim(),
});

export function optionalHttpUrl(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  return value.replace(/\/+$/, "");
}

export type McpToolSource = {
  id: string;
  title: string;
  description: string;
  url: string;
  enabled: boolean;
  hidden: boolean;
  userConfigurable: boolean;
  availableToMonty: boolean;
  authToken?: string;
  timeoutMs: number;
  forwardInstructions: boolean;
};

export type ToolPolicyOverride = {
  enabled?: boolean;
  hidden?: boolean;
  userConfigurable?: boolean;
  availableToMonty?: boolean;
};

export type ExternalViewConfig = {
  id: string;
  label: string;
  href: `/${string}`;
  source: `/${string}`;
};

function externalViews(): ExternalViewConfig[] {
  const raw = process.env.APP_EXTERNAL_VIEWS?.trim();
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("APP_EXTERNAL_VIEWS must be a JSON array.");
  const ids = new Set<string>();
  return parsed.map((value, index) => {
    if (!value || typeof value !== "object") {
      throw new Error(`APP_EXTERNAL_VIEWS[${index}] must be an object.`);
    }
    const item = value as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const href = typeof item.href === "string" ? item.href.trim() : "";
    const source = typeof item.source === "string" ? item.source.trim() : "";
    if (!/^[a-z][a-z0-9_-]{0,62}$/.test(id) || ids.has(id)) {
      throw new Error(`APP_EXTERNAL_VIEWS[${index}].id must be a unique lowercase slug.`);
    }
    if (!label || !href.startsWith("/") || !source.startsWith("/")) {
      throw new Error(`APP_EXTERNAL_VIEWS[${index}] requires label, href, and source.`);
    }
    ids.add(id);
    return { id, label, href: href as `/${string}`, source: source as `/${string}` };
  });
}

function toolPolicyOverrides(): Record<string, ToolPolicyOverride> {
  const raw = process.env.TOOL_POLICIES?.trim();
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("TOOL_POLICIES must be valid JSON.", { cause: error });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("TOOL_POLICIES must be a JSON object keyed by tool id.");
  }
  return Object.fromEntries(Object.entries(parsed).map(([id, value]) => {
    if (!/^[a-z][a-z0-9_-]{0,62}$/.test(id) || !value || typeof value !== "object") {
      throw new Error(`Invalid TOOL_POLICIES entry: ${id}`);
    }
    const policy = value as Record<string, unknown>;
    for (const field of ["enabled", "hidden", "userConfigurable", "availableToMonty"] as const) {
      if (policy[field] !== undefined && typeof policy[field] !== "boolean") {
        throw new Error(`TOOL_POLICIES.${id}.${field} must be boolean.`);
      }
    }
    return [id, {
      ...(typeof policy.enabled === "boolean" ? { enabled: policy.enabled } : {}),
      ...(typeof policy.hidden === "boolean" ? { hidden: policy.hidden } : {}),
      ...(typeof policy.userConfigurable === "boolean"
        ? { userConfigurable: policy.userConfigurable }
        : {}),
      ...(typeof policy.availableToMonty === "boolean"
        ? { availableToMonty: policy.availableToMonty }
        : {}),
    }];
  }));
}

function mcpToolSources(): McpToolSource[] {
  const raw = process.env.MCP_TOOL_SOURCES?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("MCP_TOOL_SOURCES must be valid JSON.", { cause: error });
  }
  if (!Array.isArray(parsed)) {
    throw new Error("MCP_TOOL_SOURCES must be a JSON array.");
  }
  const seen = new Set<string>();
  return parsed.map((value, index) => {
    if (!value || typeof value !== "object") {
      throw new Error(`MCP_TOOL_SOURCES[${index}] must be an object.`);
    }
    const source = value as Record<string, unknown>;
    const id = typeof source.id === "string" ? source.id.trim() : "";
    const title = typeof source.title === "string" ? source.title.trim() : "";
    const description =
      typeof source.description === "string" ? source.description.trim() : "";
    const rawUrl = typeof source.url === "string" ? source.url.trim() : "";
    if (!/^[a-z][a-z0-9_-]{0,62}$/.test(id)) {
      throw new Error(`MCP_TOOL_SOURCES[${index}].id must be a lowercase slug.`);
    }
    if (seen.has(id)) throw new Error(`Duplicate MCP tool source id: ${id}`);
    if (!title || !description) {
      throw new Error(`MCP tool source ${id} requires title and description.`);
    }
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch (error) {
      throw new Error(`MCP tool source ${id} has an invalid URL.`, { cause: error });
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(`MCP tool source ${id} URL must use HTTP or HTTPS.`);
    }
    const authTokenFile =
      typeof source.authTokenFile === "string" ? source.authTokenFile.trim() : "";
    const authToken = authTokenFile
      ? readFileSync(authTokenFile, "utf8").trim()
      : typeof source.authToken === "string"
        ? source.authToken.trim()
        : undefined;
    if (authTokenFile && !authToken) {
      throw new Error(`MCP tool source ${id} auth token file is empty.`);
    }
    const timeoutMs = source.timeoutMs === undefined ? 60_000 : Number(source.timeoutMs);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) {
      throw new Error(`MCP tool source ${id} timeoutMs must be from 1000 to 300000.`);
    }
    const enabled = typeof source.enabled === "boolean"
      ? source.enabled
      : source.defaultEnabled !== false;
    const userConfigurable = source.userConfigurable === true;
    const hidden = source.hidden === true;
    const availableToMonty = source.availableToMonty === true;
    seen.add(id);
    return {
      id,
      title,
      description,
      url: url.toString(),
      enabled,
      hidden,
      userConfigurable,
      availableToMonty,
      authToken,
      timeoutMs,
      forwardInstructions: source.forwardInstructions !== false,
    };
  });
}

const vikunjaApiUrl = process.env.VIKUNJA_API_URL?.trim();
const vikunjaApiToken = secretValue(
  "VIKUNJA_API_TOKEN",
  "VIKUNJA_API_TOKEN_FILE",
);
const localModelBaseUrl = (
  process.env.OLLAMA_MODEL_BASE_URL?.trim() ||
  process.env.SCHEDULED_MODEL_BASE_URL?.trim() ||
  "http://127.0.0.1:11434/v1"
).replace(/\/+$/, "");
const scheduledModelName = process.env.SCHEDULED_MODEL_NAME?.trim() || "qwen3:8b";

if (userScopeMode === "jwt") {
  for (const name of ["USER_SCOPE_JWT_JWKS_URL", "USER_SCOPE_JWT_ISSUER"]) {
    if (!process.env[name]?.trim()) {
      throw new Error(`${name} is required when USER_SCOPE_MODE is jwt.`);
    }
  }
}

export const publicConfig = {
  mastraApiUrl:
    process.env.NEXT_PUBLIC_MASTRA_API_URL ?? LOCAL_MASTRA_API_URL,
} as const;

export const serverConfig = {
  appBranding,
  databaseUrl:
    secretValue("DATABASE_URL", "DATABASE_URL_FILE") ?? LOCAL_DATABASE_URL,
  vikunjaApiUrl,
  vikunjaApiToken,
  vikunjaProjectId: boundedInteger("VIKUNJA_PROJECT_ID", 1, 1, 2_147_483_647),
  taskServiceConfigured: Boolean(vikunjaApiUrl && vikunjaApiToken),
  externalViews: externalViews(),
  mcpToolSources: mcpToolSources(),
  toolPolicyOverrides: toolPolicyOverrides(),
  scheduleRunImmediately: booleanValue("SCHEDULE_RUN_IMMEDIATELY", true),
  webPushSubject: process.env.WEB_PUSH_SUBJECT?.trim() || "mailto:admin@localhost",
  webPushPublicKey: process.env.WEB_PUSH_PUBLIC_KEY?.trim(),
  webPushPrivateKey: secretValue(
    "WEB_PUSH_PRIVATE_KEY",
    "WEB_PUSH_PRIVATE_KEY_FILE",
  ),
  dashboard: {
    sqlDatabaseUrl: secretValue(
      "DASHBOARD_SQL_DATABASE_URL",
      "DASHBOARD_SQL_DATABASE_URL_FILE",
    ),
    sqlSchemaDescription:
      process.env.DASHBOARD_SQL_SCHEMA_DESCRIPTION?.trim(),
    sqlStatementTimeoutMs: boundedInteger(
      "DASHBOARD_SQL_STATEMENT_TIMEOUT_MS",
      30_000,
      1_000,
      300_000,
    ),
    sqlConnectionTimeoutMs: boundedInteger(
      "DASHBOARD_SQL_CONNECTION_TIMEOUT_MS",
      15_000,
      1_000,
      60_000,
    ),
  },
  agentMaxSteps: boundedInteger("MASTRA_AGENT_MAX_STEPS", 16, 1, 40),
  openaiApiKey: secretValue("OPENAI_API_KEY", "OPENAI_API_KEY_FILE"),
  localModelBaseUrl,
  scheduledModelName,
  // Hosts may dedicate a separate CPU runtime to lightweight web UI work.
  // Falling back keeps standalone deployments on their existing local model.
  webModelBaseUrl: (
    process.env.WEB_MODEL_BASE_URL?.trim() || localModelBaseUrl
  ).replace(/\/+$/, ""),
  webModelName: process.env.WEB_MODEL_NAME?.trim() || scheduledModelName,
  phoenix: {
    collectorEndpoint: optionalHttpUrl("PHOENIX_COLLECTOR_ENDPOINT"),
    apiKey: secretValue("PHOENIX_API_KEY", "PHOENIX_API_KEY_FILE"),
    projectName: process.env.PHOENIX_PROJECT_NAME?.trim() || appBranding.fullName,
    serviceName: process.env.PHOENIX_SERVICE_NAME?.trim() || appBranding.fullName,
  },
  mastraHost: process.env.MASTRA_HOST?.trim() || "127.0.0.1",
  mastraApiUrl: process.env.MASTRA_API_URL ?? LOCAL_MASTRA_API_URL,
  modelProvider,
  modelName,
  modelId: `${modelProvider}/${modelName}`,
  reasoningEffort: process.env.REASONING_EFFORT?.trim().toLowerCase(),
  codexAgentEnabled: process.env.CODEX_AGENT_ENABLED !== "false",
  codexAgentMode,
  codexWorkspacePath:
    process.env.CODEX_WORKSPACE_PATH?.trim() || process.cwd(),
  codexAcpCommand: process.env.CODEX_ACP_COMMAND?.trim(),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  userScope: {
    mode: userScopeMode as "local" | "header" | "jwt",
    header: process.env.USER_SCOPE_HEADER?.trim() || "x-authentik-uid",
    nameHeader:
      process.env.USER_SCOPE_NAME_HEADER?.trim() || "x-authentik-name",
    emailHeader:
      process.env.USER_SCOPE_EMAIL_HEADER?.trim() || "x-authentik-email",
    jwtHeader:
      process.env.USER_SCOPE_JWT_HEADER?.trim() || "authorization",
    jwtClaim: process.env.USER_SCOPE_JWT_CLAIM?.trim() || "sub",
    jwtNameClaim: process.env.USER_SCOPE_JWT_NAME_CLAIM?.trim() || "name",
    jwtEmailClaim: process.env.USER_SCOPE_JWT_EMAIL_CLAIM?.trim() || "email",
    jwtJwksUrl: process.env.USER_SCOPE_JWT_JWKS_URL?.trim(),
    jwtIssuer: process.env.USER_SCOPE_JWT_ISSUER?.trim(),
    jwtAudience: process.env.USER_SCOPE_JWT_AUDIENCE?.trim(),
  },
} as const;
