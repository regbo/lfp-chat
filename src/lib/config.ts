const LOCAL_DATABASE_URL =
  "postgresql://mastra:mastra@localhost:5432/mastra";

const LOCAL_MASTRA_API_URL = "http://localhost:4111";
const DEFAULT_MODEL_PROVIDER = "openai";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";

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
  databaseUrl: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
  mastraHost: process.env.MASTRA_HOST?.trim() || "0.0.0.0",
  mastraApiUrl: process.env.MASTRA_API_URL ?? LOCAL_MASTRA_API_URL,
  modelProvider,
  modelName,
  modelId: `${modelProvider}/${modelName}`,
  reasoningEffort: process.env.REASONING_EFFORT?.trim().toLowerCase(),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
} as const;

const providerApiKeyVariables: Readonly<Record<string, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
};

export function getProviderSetupMessage() {
  const keyVariable = providerApiKeyVariables[serverConfig.modelProvider];

  if (!keyVariable) {
    return `Authentication failed for ${serverConfig.modelProvider}. Add the API key required by that provider to .env.local.`;
  }

  return `${keyVariable} is missing or invalid. Add it to .env.local and restart the Mastra server.`;
}
