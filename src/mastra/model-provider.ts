import { createOpenAI, openai } from "@ai-sdk/openai";
import type { ToolsInput } from "@mastra/core/agent";
import type { ModelRouterModelId } from "@mastra/core/llm";
import type { RequestContext } from "@mastra/core/request-context";
import { webSearchTool } from "@mastra/core/tools";

import { serverConfig } from "@/lib/config";
import { SCHEDULE_JOB_CONTEXT_KEY } from "@/lib/schedules";
import {
  ChatGptSubscriptionGateway,
  CHATGPT_SUBSCRIPTION_GATEWAY_ID,
  CHATGPT_SUBSCRIPTION_PROVIDER_ID,
} from "@/mastra/chatgpt-subscription-gateway";
import {
  createAgentCatalog,
  createModelCatalog,
  MODEL_CONTEXT_KEY,
  normalizeModelSelection,
  REASONING_CONTEXT_KEY,
  type ModelSelection,
} from "@/lib/model-catalog";

// Next.js routes do not pass through the standalone server bootstrap, so make
// file-backed OpenAI credentials available to Mastra's model router here too.
if (!process.env.OPENAI_API_KEY && serverConfig.openaiApiKey) {
  process.env.OPENAI_API_KEY = serverConfig.openaiApiKey;
}

const subscriptionModelProvider = `${CHATGPT_SUBSCRIPTION_GATEWAY_ID}/${CHATGPT_SUBSCRIPTION_PROVIDER_ID}`;
const additionalModelSources = serverConfig.chatgptSubscription.enabled
  ? [
      {
        provider: subscriptionModelProvider,
        modelNames: serverConfig.chatgptSubscription.models,
        description:
          "OpenAI Responses model authenticated through the local ChatGPT subscription.",
      },
    ]
  : [];

export const chatGptSubscriptionGateway = serverConfig.chatgptSubscription.enabled
  ? new ChatGptSubscriptionGateway(serverConfig.chatgptSubscription)
  : undefined;

let cachedModelCatalog = createModelCatalog(
  serverConfig.modelProvider,
  serverConfig.modelId,
  serverConfig.reasoningEffort,
  undefined,
  createAgentCatalog(serverConfig.codexAgentEnabled),
  additionalModelSources,
);
let modelCatalogExpiresAt = 0;
let pendingModelCatalog: Promise<typeof cachedModelCatalog> | null = null;

const MODEL_CATALOG_TTL_MS = 10 * 60 * 1_000;
const localOllama = createOpenAI({
  name: "ollama",
  baseURL: serverConfig.localModelBaseUrl,
  apiKey: "local-bridge",
});
const webOllama = createOpenAI({
  name: "web-ollama",
  baseURL: serverConfig.webModelBaseUrl,
  apiKey: "local-bridge",
});

/** Use the inexpensive local model for background UI assistance. */
export function resolveBackgroundModel() {
  return webOllama.chat(serverConfig.webModelName);
}

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
    additionalModelSources,
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
  const controller = requestContext?.get("controller") as
    | { session?: { modelId?: unknown } }
    | undefined;
  const controllerModelId =
    typeof controller?.session?.modelId === "string"
      ? controller.session.modelId
      : undefined;
  return normalizeModelSelection(cachedModelCatalog, {
    // AgentController persists the selected model per mode and thread. Legacy
    // direct-agent and scheduled calls continue to use the request-context key.
    modelId:
      controllerModelId ??
      (requestContext?.get(MODEL_CONTEXT_KEY) as string | undefined),
    reasoningEffort: requestContext?.get(REASONING_CONTEXT_KEY) as
      | ModelSelection["reasoningEffort"]
      | undefined,
  });
}

export function resolveRuntimeModel(requestContext?: RequestContext) {
  if (requestContext?.get(SCHEDULE_JOB_CONTEXT_KEY) === true) {
    return localOllama.chat(serverConfig.scheduledModelName);
  }
  const selection = selectionFromRequestContext(requestContext);
  return selection.modelId as ModelRouterModelId;
}

export function resolveRuntimeOptions(requestContext?: RequestContext) {
  if (requestContext?.get(SCHEDULE_JOB_CONTEXT_KEY) === true) {
    return { maxSteps: serverConfig.agentMaxSteps, providerOptions: undefined };
  }
  const selection = selectionFromRequestContext(requestContext);
  const model = cachedModelCatalog.models.find(
    (candidate) => candidate.id === selection.modelId,
  );

  return {
    maxSteps: serverConfig.agentMaxSteps,
    providerOptions:
      (model?.provider === "openai" ||
        model?.provider === subscriptionModelProvider) &&
      (selection.reasoningEffort || model.provider === subscriptionModelProvider)
        ? {
            openai: {
              ...(selection.reasoningEffort
                ? {
                    reasoningEffort: selection.reasoningEffort,
                    reasoningSummary: "auto" as const,
                  }
                : {}),
              ...(model.provider === subscriptionModelProvider
                ? { strictJsonSchema: false }
                : {}),
            },
          }
        : undefined,
  };
}

/** Hosted provider tools must match the model that receives the request. */
export function supportsConfiguredProviderTools(requestContext?: RequestContext) {
  if (requestContext?.get(SCHEDULE_JOB_CONTEXT_KEY) === true) return false;
  return selectionFromRequestContext(requestContext).modelId.startsWith(
    `${serverConfig.modelProvider}/`,
  );
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
