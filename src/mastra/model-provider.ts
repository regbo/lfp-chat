import { openai } from "@ai-sdk/openai";
import type { ToolsInput } from "@mastra/core/agent";
import type { ModelRouterModelId } from "@mastra/core/llm";
import type { RequestContext } from "@mastra/core/request-context";
import { webSearchTool } from "@mastra/core/tools";

import { serverConfig } from "@/lib/config";
import {
  createAgentCatalog,
  createModelCatalog,
  MODEL_CONTEXT_KEY,
  normalizeModelSelection,
  REASONING_CONTEXT_KEY,
  type ModelSelection,
} from "@/lib/model-catalog";

let cachedModelCatalog = createModelCatalog(
  serverConfig.modelProvider,
  serverConfig.modelId,
  serverConfig.reasoningEffort,
  undefined,
  createAgentCatalog(serverConfig.codexAgentEnabled),
);
let modelCatalogExpiresAt = 0;
let pendingModelCatalog: Promise<typeof cachedModelCatalog> | null = null;

const MODEL_CATALOG_TTL_MS = 10 * 60 * 1_000;

type OpenAiModelsResponse = {
  data?: Array<{ id?: string }>;
};

async function discoverOpenAiModels() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return cachedModelCatalog;

  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI model discovery failed with ${response.status}.`);
  }
  const payload = (await response.json()) as OpenAiModelsResponse;
  const modelNames = payload.data
    ?.map((model) => model.id)
    .filter((id): id is string => Boolean(id));

  cachedModelCatalog = createModelCatalog(
    serverConfig.modelProvider,
    serverConfig.modelId,
    serverConfig.reasoningEffort,
    modelNames,
    createAgentCatalog(serverConfig.codexAgentEnabled),
  );
  modelCatalogExpiresAt = Date.now() + MODEL_CATALOG_TTL_MS;
  return cachedModelCatalog;
}

export function getCachedModelCatalog() {
  return cachedModelCatalog;
}

export async function getModelCatalog() {
  if (
    serverConfig.modelProvider !== "openai" ||
    Date.now() < modelCatalogExpiresAt
  ) {
    return cachedModelCatalog;
  }
  if (!pendingModelCatalog) {
    pendingModelCatalog = discoverOpenAiModels()
      .catch((error) => {
        console.warn(
          "Using the configured model because provider discovery failed.",
          error,
        );
        modelCatalogExpiresAt = Date.now() + 30_000;
        return cachedModelCatalog;
      })
      .finally(() => {
        pendingModelCatalog = null;
      });
  }
  return pendingModelCatalog;
}

function selectionFromRequestContext(requestContext?: RequestContext) {
  return normalizeModelSelection(cachedModelCatalog, {
    modelId: requestContext?.get(MODEL_CONTEXT_KEY) as string | undefined,
    reasoningEffort: requestContext?.get(REASONING_CONTEXT_KEY) as
      | ModelSelection["reasoningEffort"]
      | undefined,
  });
}

export function resolveRuntimeModel(requestContext?: RequestContext) {
  return selectionFromRequestContext(requestContext).modelId as ModelRouterModelId;
}

export function resolveRuntimeOptions(requestContext?: RequestContext) {
  const selection = selectionFromRequestContext(requestContext);
  const model = cachedModelCatalog.models.find(
    (candidate) => candidate.id === selection.modelId,
  );

  return {
    maxSteps: serverConfig.agentMaxSteps,
    providerOptions:
      model?.provider === "openai" && selection.reasoningEffort
        ? {
            openai: {
              reasoningEffort: selection.reasoningEffort,
              reasoningSummary: "auto",
            },
          }
        : undefined,
  };
}

const providersWithNativeWebSearch = new Set([
  "anthropic",
  "google",
  "openai",
  "xai",
]);

const providerTools: ToolsInput = {};

if (providersWithNativeWebSearch.has(serverConfig.modelProvider)) {
  providerTools.web_search = webSearchTool;
}

// These hosted tools are part of OpenAI's Responses API, so they are only
// advertised when the selected model is routed to OpenAI.
if (serverConfig.modelProvider === "openai") {
  providerTools.code_interpreter = openai.tools.codeInterpreter();
  providerTools.image_generation = openai.tools.imageGeneration({
    model: "gpt-image-2",
    quality: "auto",
    size: "auto",
  });
}

const capabilityInstructions = [
  providersWithNativeWebSearch.has(serverConfig.modelProvider)
    ? "Use web_search for current internet information and cite its sources."
    : undefined,
  serverConfig.modelProvider === "openai"
    ? "Use code_interpreter for richer data analysis or work involving uploaded files, and image_generation when the user asks to create an image."
    : undefined,
]
  .filter((instruction): instruction is string => Boolean(instruction))
  .join(" ");

export const modelProvider = {
  id: serverConfig.modelProvider,
  modelName: serverConfig.modelName,
  // Mastra's model router resolves this provider/model identifier directly.
  model: serverConfig.modelId as ModelRouterModelId,
  tools: providerTools,
  capabilityInstructions,
} as const;
