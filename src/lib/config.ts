import { readFileSync } from "node:fs";

import { createAppBranding } from "@/lib/app-branding";

const LOCAL_DATABASE_URL =
  "postgresql://mastra:mastra@localhost:5432/mastra";

const LOCAL_MASTRA_API_URL = "http://localhost:4111";
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

function secretValue(valueName: string, fileName: string) {
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

function optionalHttpUrl(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  return value.replace(/\/+$/, "");
}

const vikunjaApiUrl = process.env.VIKUNJA_API_URL?.trim();
const vikunjaApiToken = secretValue(
  "VIKUNJA_API_TOKEN",
  "VIKUNJA_API_TOKEN_FILE",
);

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
  localModelBaseUrl: (
    process.env.OLLAMA_MODEL_BASE_URL?.trim() ||
    process.env.SCHEDULED_MODEL_BASE_URL?.trim() ||
    "http://127.0.0.1:11434/v1"
  ).replace(/\/+$/, ""),
  scheduledModelName: process.env.SCHEDULED_MODEL_NAME?.trim() || "qwen3:8b",
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
