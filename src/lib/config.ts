import { readFileSync } from "node:fs";

const LOCAL_DATABASE_URL =
  "postgresql://mastra:mastra@localhost:5432/mastra";

const LOCAL_MASTRA_API_URL = "http://localhost:4111";
const DEFAULT_MODEL_PROVIDER = "openai";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const DEFAULT_CODEX_AGENT_MODE = "agent";

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
  familyGraphGroupId:
    process.env.FAMILY_GRAPH_GROUP_ID?.trim() || "family-home",
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
} as const;
