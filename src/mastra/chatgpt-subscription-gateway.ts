import { createOpenAI } from "@ai-sdk/openai";
import {
  MastraModelGateway,
  type GatewayAuthRequest,
  type GatewayAuthResult,
  type GatewayLanguageModel,
  type ProviderConfig,
} from "@mastra/core/llm";

export const CHATGPT_SUBSCRIPTION_GATEWAY_ID = "subscription";
export const CHATGPT_SUBSCRIPTION_PROVIDER_ID = "chatgpt";

type ChatGptSubscriptionGatewayOptions = {
  baseUrl: string;
  models: readonly string[];
  proxyKey?: string;
};

async function fetchChatGptSubscription(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  if (typeof init?.body !== "string") return globalThis.fetch(input, init);
  try {
    const payload = JSON.parse(init.body) as Record<string, unknown>;
    if (!Array.isArray(payload.tools)) return globalThis.fetch(input, init);
    const tools = payload.tools.map((tool) => {
      if (
        !tool ||
        typeof tool !== "object" ||
        (tool as Record<string, unknown>).type !== "function"
      ) {
        return tool;
      }
      // Mastra tools may have optional inputs. The ChatGPT Codex endpoint only
      // accepts those schemas when OpenAI strict function validation is off.
      return { ...(tool as Record<string, unknown>), strict: false };
    });
    return globalThis.fetch(input, {
      ...init,
      body: JSON.stringify({ ...payload, tools }),
    });
  } catch {
    return globalThis.fetch(input, init);
  }
}

/** Routes Mastra model calls through LiteLLM while LiteLLM owns ChatGPT OAuth. */
export class ChatGptSubscriptionGateway extends MastraModelGateway {
  readonly id = CHATGPT_SUBSCRIPTION_GATEWAY_ID;
  readonly name = "ChatGPT Subscription";

  readonly #baseUrl: string;
  readonly #models: string[];
  readonly #proxyKey: string;
  readonly #provider: ReturnType<typeof createOpenAI>;

  constructor(options: ChatGptSubscriptionGatewayOptions) {
    super();
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#models = [...options.models];
    this.#proxyKey = options.proxyKey || "local-subscription-bridge";
    this.#provider = createOpenAI({
      name: "chatgpt-subscription",
      baseURL: this.#baseUrl,
      apiKey: this.#proxyKey,
      fetch: fetchChatGptSubscription as typeof globalThis.fetch,
    });
  }

  async fetchProviders(): Promise<Record<string, ProviderConfig>> {
    return {
      [CHATGPT_SUBSCRIPTION_PROVIDER_ID]: {
        name: "ChatGPT Subscription",
        models: this.#models,
        apiKeyEnvVar: "LITELLM_PROXY_KEY",
        gateway: this.id,
        url: this.#baseUrl,
        docUrl: "https://docs.litellm.ai/docs/providers/chatgpt",
      },
    };
  }

  buildUrl() {
    return this.#baseUrl;
  }

  async getApiKey() {
    return this.#proxyKey;
  }

  resolveAuth(_request: GatewayAuthRequest): GatewayAuthResult {
    return { apiKey: this.#proxyKey, source: "gateway" };
  }

  resolveLanguageModel({
    modelId,
    providerId,
  }: {
    modelId: string;
    providerId: string;
  }): GatewayLanguageModel {
    const upstreamModel = modelId.startsWith(`${providerId}/`)
      ? modelId
      : `${providerId}/${modelId.split("/").at(-1)}`;
    return this.#provider.responses(upstreamModel);
  }
}
