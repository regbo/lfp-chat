export const MODEL_CONTEXT_KEY = "lfp.model";
export const REASONING_CONTEXT_KEY = "lfp.reasoning";
export const TOOL_MODEL_SELECTIONS_CONTEXT_KEY = "lfp.toolModels";

export const DEFAULT_CHAT_AGENT_ID = "chatAgent";
export const CODEX_CHAT_AGENT_ID = "codexAgent";
export const CODEX_CONTROLLER_MODE_ID = "code";

export const reasoningEfforts = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningEffort = (typeof reasoningEfforts)[number];

export type ChatModelDefinition = {
  id: string;
  label: string;
  shortLabel: string;
  provider: string;
  description: string;
  reasoningEfforts: ReasoningEffort[];
  defaultReasoningEffort: ReasoningEffort | null;
};

export type ChatAgentDefinition = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
};

export type ModelCatalogResponse = {
  models: ChatModelDefinition[];
  agents: ChatAgentDefinition[];
  defaultSelection: ModelSelection;
};

export type ModelSelection = {
  agentId: string;
  modelId: string;
  reasoningEffort: ReasoningEffort | null;
};

export function createAgentCatalog(codexEnabled: boolean): ChatAgentDefinition[] {
  return codexEnabled
    ? [
        {
          id: CODEX_CHAT_AGENT_ID,
          label: "Codex (ChatGPT)",
          shortLabel: "Codex",
          description:
            "Subscription-backed Codex app-server with scoped workspace and shell access.",
        },
      ]
    : [];
}

function titleCase(value: string) {
  return value
    .replaceAll(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const excludedOpenAiModelFragments = [
  "audio",
  "codex",
  "deep-research",
  "image",
  "instruct",
  "moderation",
  "realtime",
  "search-api",
  "search-preview",
  "transcribe",
  "tts",
];

export function isSelectableOpenAiModel(modelId: string) {
  const id = modelId.toLowerCase();
  const isTextModel =
    id.startsWith("gpt-") || /^o(?:1|3|4)(?:-|$)/.test(id);
  return (
    isTextModel &&
    !excludedOpenAiModelFragments.some((fragment) => id.includes(fragment))
  );
}

function getReasoningEfforts(modelName: string): ReasoningEffort[] {
  const name = modelName.toLowerCase();
  if (name.startsWith("gpt-5.6")) {
    return ["none", "low", "medium", "high", "xhigh", "max"];
  }
  if (name.startsWith("gpt-5")) {
    return ["none", "minimal", "low", "medium", "high", "xhigh"];
  }
  if (/^o(?:1|3|4)(?:-|$)/.test(name)) {
    return ["low", "medium", "high"];
  }
  return [];
}

function formatOpenAiModelName(modelName: string) {
  const isGpt = modelName.toLowerCase().startsWith("gpt-");
  const formatted = modelName
    .replace(/^gpt-/i, "")
    .split("-")
    .map((part) => titleCase(part))
    .join(" ");
  return isGpt ? `GPT-${formatted}` : formatted.replace(/^O(?=\d)/, "o");
}

function createModelDefinition(provider: string, modelName: string) {
  const efforts = provider === "openai" ? getReasoningEfforts(modelName) : [];
  const label =
    provider === "openai" ? formatOpenAiModelName(modelName) : titleCase(modelName);
  const shortLabel = label.replace(/^GPT-/, "");

  return {
    id: `${provider}/${modelName}`,
    label,
    shortLabel,
    provider,
    description:
      efforts.length > 0
        ? "Reasoning model available to this API key."
        : "Chat model available to this API key.",
    reasoningEfforts: efforts,
    defaultReasoningEffort: efforts.includes("medium") ? "medium" : null,
  } satisfies ChatModelDefinition;
}

export function createModelCatalog(
  provider: string,
  defaultModelId: string,
  configuredReasoning: string | undefined,
  discoveredModelNames?: string[],
  agents: ChatAgentDefinition[] = [],
): ModelCatalogResponse {
  const configuredModelName =
    defaultModelId.split("/").slice(1).join("/") || defaultModelId;
  const modelNames = Array.from(
    new Set(
      discoveredModelNames?.filter((modelName) =>
        provider === "openai" ? isSelectableOpenAiModel(modelName) : true,
      ) ?? [configuredModelName],
    ),
  );
  const models = modelNames
    .map((modelName) => createModelDefinition(provider, modelName))
    .sort((left, right) => {
      if (left.id === defaultModelId) return -1;
      if (right.id === defaultModelId) return 1;
      return right.label.localeCompare(left.label, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

  if (!models.some((model) => model.id === defaultModelId)) {
    models.unshift(createModelDefinition(provider, configuredModelName));
  }

  const defaultModel =
    models.find((model) => model.id === defaultModelId) ?? models[0];
  const configuredEffort = reasoningEfforts.find(
    (effort) => effort === configuredReasoning,
  );

  return {
    models,
    agents,
    defaultSelection: {
      agentId: DEFAULT_CHAT_AGENT_ID,
      modelId: defaultModel.id,
      reasoningEffort:
        configuredEffort && defaultModel.reasoningEfforts.includes(configuredEffort)
          ? configuredEffort
          : defaultModel.defaultReasoningEffort,
    },
  };
}

export function normalizeModelSelection(
  catalog: ModelCatalogResponse,
  selection?: Partial<ModelSelection>,
): ModelSelection {
  const selectedAgent = catalog.agents.find(
    (candidate) => candidate.id === selection?.agentId,
  );
  const model =
    catalog.models.find((candidate) => candidate.id === selection?.modelId) ??
    catalog.models.find(
      (candidate) => candidate.id === catalog.defaultSelection.modelId,
    ) ??
    catalog.models[0];
  const requestedEffort = selection?.reasoningEffort;

  return {
    agentId: selectedAgent?.id ?? DEFAULT_CHAT_AGENT_ID,
    modelId: model.id,
    reasoningEffort:
      selectedAgent
        ? null
        : requestedEffort && model.reasoningEfforts.includes(requestedEffort)
        ? requestedEffort
        : model.defaultReasoningEffort,
  };
}

export function modelSelectionForControllerMode(
  catalog: ModelCatalogResponse,
  selection: Partial<ModelSelection> | undefined,
  modeId: string,
): ModelSelection {
  return normalizeModelSelection(catalog, {
    ...selection,
    agentId:
      modeId === CODEX_CONTROLLER_MODE_ID
        ? CODEX_CHAT_AGENT_ID
        : selection?.agentId === CODEX_CHAT_AGENT_ID
          ? DEFAULT_CHAT_AGENT_ID
          : selection?.agentId,
  });
}

export function mostPowerfulModelSelection(
  catalog: ModelCatalogResponse,
): ModelSelection {
  const model =
    catalog.models.find((candidate) => /gpt-5\.6-sol(?:-|$)/i.test(candidate.id)) ??
    catalog.models.find((candidate) => /-pro(?:-|$)/i.test(candidate.id)) ??
    catalog.models.find((candidate) => candidate.reasoningEfforts.length > 0) ??
    catalog.models[0];
  const reasoningEffort = [...reasoningEfforts]
    .reverse()
    .find((effort) => model.reasoningEfforts.includes(effort)) ?? null;
  return {
    agentId: DEFAULT_CHAT_AGENT_ID,
    modelId: model.id,
    reasoningEffort,
  };
}

export function formatReasoningEffort(effort: ReasoningEffort | null) {
  if (!effort) return "";
  return effort === "xhigh" ? "XHigh" : titleCase(effort);
}
