import { createOpenAI, openai } from "@ai-sdk/openai";
import type { ToolsInput } from "@mastra/core/agent";
import type { ModelRouterModelId } from "@mastra/core/llm";
import type { RequestContext } from "@mastra/core/request-context";
import { webSearchTool } from "@mastra/core/tools";

import { serverConfig } from "@/lib/config";
import { SCHEDULE_JOB_CONTEXT_KEY } from "@/lib/schedules";
import { withoutLiteLlmResponseState } from "@/mastra/openai-conversation-state";
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
const liteLlm = serverConfig.openaiBaseUrl
  ? createOpenAI({
      // Keep the Responses transport, but use a proxy-specific provider name so
      // the SDK cannot carry OpenAI previous_response_id state across tool steps.
      name: "lfp-litellm",
      baseURL: serverConfig.openaiBaseUrl,
      apiKey: serverConfig.openaiApiKey || "local-subscription-bridge",
    })
  : undefined;

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

  const response = await fetch(
    `${serverConfig.openaiBaseUrl ?? "https://api.openai.com/v1"}/models`,
    {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
    },
  );
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

export function openAiReasoningProviderOptions(
  reasoningEffort: ModelSelection["reasoningEffort"],
) {
  if (!reasoningEffort) return undefined;
  return {
    openai: {
      reasoningEffort,
      ...(reasoningEffort === "none" ? {} : { reasoningSummary: "auto" }),
    },
  };
}

export function openAiReasoningModelSettings(
  reasoningEffort: ModelSelection["reasoningEffort"],
) {
  if (!reasoningEffort) return undefined;
  // AI SDK's generic reasoning enum currently stops at xhigh. The OpenAI
  // provider option still carries max and takes precedence when supported.
  return { reasoning: reasoningEffort === "max" ? "xhigh" : reasoningEffort };
}

export function resolveRuntimeModel(requestContext?: RequestContext) {
  if (requestContext?.get(SCHEDULE_JOB_CONTEXT_KEY) === true) {
    return localOllama.chat(serverConfig.scheduledModelName);
  }
  const selection = selectionFromRequestContext(requestContext);
  if (liteLlm) {
    return liteLlm.responses(selection.modelId.split("/").slice(1).join("/"));
  }
  return selection.modelId as ModelRouterModelId;
}

export function resolveRuntimeOptions(requestContext?: RequestContext) {
  if (requestContext?.get(SCHEDULE_JOB_CONTEXT_KEY) === true) {
    return { maxSteps: serverConfig.agentMaxSteps, providerOptions: undefined };
  }
  const selection = selectionFromRequestContext(requestContext);
  if (liteLlm) {
    return {
      maxSteps: serverConfig.agentMaxSteps,
      modelSettings: openAiReasoningModelSettings(selection.reasoningEffort),
      // The per-step processor applies this again so both Mastra's current and
      // legacy streaming routes receive the same proxy-safe options.
      providerOptions: withoutLiteLlmResponseState(
        openAiReasoningProviderOptions(selection.reasoningEffort),
      ),
    };
  }
  const model = cachedModelCatalog.models.find(
    (candidate) => candidate.id === selection.modelId,
  );

  return {
    maxSteps: serverConfig.agentMaxSteps,
    modelSettings:
      model?.provider === "openai"
        ? openAiReasoningModelSettings(selection.reasoningEffort)
        : undefined,
    providerOptions:
      model?.provider === "openai"
        ? openAiReasoningProviderOptions(selection.reasoningEffort)
        : undefined,
  };
}

const providersWithNativeWebSearch = new Set([
  "anthropic",
  "google",
  "openai",
  "xai",
]);
const hasNativeWebSearch =
  providersWithNativeWebSearch.has(serverConfig.modelProvider) &&
  !(serverConfig.modelProvider === "openai" && serverConfig.openaiBaseUrl);

const providerTools: ToolsInput = {};
const usesDirectOpenAi =
  serverConfig.modelProvider === "openai" && !serverConfig.openaiBaseUrl;

if (hasNativeWebSearch) {
  providerTools.web_search = webSearchTool;
}

// These hosted tools are part of OpenAI's Responses API, so they are only
// advertised when the selected model is routed to OpenAI.
if (usesDirectOpenAi) {
  providerTools.code_interpreter = openai.tools.codeInterpreter();
  providerTools.image_generation = openai.tools.imageGeneration({
    model: "gpt-image-2",
    quality: "auto",
    size: "auto",
  });
}

const capabilityInstructions = [
  hasNativeWebSearch
    ? "Use web_search for current internet information and cite its sources."
    : undefined,
  usesDirectOpenAi
    ? "Use code_interpreter for richer data analysis or work involving uploaded files, and image_generation when the user asks to create an image."
    : undefined,
]
  .filter((instruction): instruction is string => Boolean(instruction))
  .join(" ");

export const modelProvider = {
  id: serverConfig.modelProvider,
  modelName: serverConfig.modelName,
  // Mastra's model router resolves this provider/model identifier directly.
  model: liteLlm?.responses(serverConfig.modelName) ??
    serverConfig.modelId as ModelRouterModelId,
  tools: providerTools,
  capabilityInstructions,
} as const;
