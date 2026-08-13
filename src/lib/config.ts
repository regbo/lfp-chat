import { readFileSync } from "node:fs";

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
  databaseUrl:
    secretValue("DATABASE_URL", "DATABASE_URL_FILE") ?? LOCAL_DATABASE_URL,
  familyDatabaseUrl: secretValue(
    "FAMILY_DATABASE_URL",
    "FAMILY_DATABASE_URL_FILE",
  ),
  graphitiApiUrl: process.env.GRAPHITI_API_URL?.trim(),
  familyContextApiUrl: process.env.FAMILY_CONTEXT_API_URL?.trim(),
  familyContextApiKey: secretValue(
    "FAMILY_CONTEXT_API_KEY",
    "FAMILY_CONTEXT_API_KEY_FILE",
  ),
  vikunjaApiUrl: process.env.VIKUNJA_API_URL?.trim(),
  vikunjaApiToken: secretValue(
    "VIKUNJA_API_TOKEN",
    "VIKUNJA_API_TOKEN_FILE",
  ),
  vikunjaProjectId: boundedInteger("VIKUNJA_PROJECT_ID", 1, 1, 2_147_483_647),
  scheduleRunImmediately: booleanValue("SCHEDULE_RUN_IMMEDIATELY", true),
  webPushSubject: process.env.WEB_PUSH_SUBJECT?.trim() || "mailto:admin@localhost",
  webPushPublicKey: process.env.WEB_PUSH_PUBLIC_KEY?.trim(),
  webPushPrivateKey: secretValue(
    "WEB_PUSH_PRIVATE_KEY",
    "WEB_PUSH_PRIVATE_KEY_FILE",
  ),
  familyGraphGroupId:
    process.env.FAMILY_GRAPH_GROUP_ID?.trim() || "family-home",
  familyEmbeddingBaseUrl: (
    process.env.FAMILY_EMBEDDING_BASE_URL?.trim() ||
    "http://127.0.0.1:11436/v1"
  ).replace(/\/+$/, ""),
  familyEmbeddingModel:
    process.env.FAMILY_EMBEDDING_MODEL?.trim() || "qwen3-embedding:0.6b",
  familyEmbeddingDimensions: boundedInteger(
    "FAMILY_EMBEDDING_DIMENSIONS",
    1_024,
    1,
    16_384,
  ),
  familyGraphTimeoutMs: boundedInteger(
    "FAMILY_GRAPH_TIMEOUT_MS",
    8_000,
    1_000,
    900_000,
  ),
  familySqlStatementTimeoutMs: boundedInteger(
    "FAMILY_SQL_STATEMENT_TIMEOUT_MS",
    60_000,
    1_000,
    300_000,
  ),
  familySqlConnectionTimeoutMs: boundedInteger(
    "FAMILY_SQL_CONNECTION_TIMEOUT_MS",
    15_000,
    1_000,
    60_000,
  ),
  agentMaxSteps: boundedInteger("MASTRA_AGENT_MAX_STEPS", 16, 1, 40),
  openaiApiKey: secretValue("OPENAI_API_KEY", "OPENAI_API_KEY_FILE"),
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
