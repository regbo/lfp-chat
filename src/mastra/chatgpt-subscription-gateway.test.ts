import { describe, expect, mock, test } from "bun:test";

import {
  ChatGptSubscriptionGateway,
  fetchChatGptSubscription,
} from "./chatgpt-subscription-gateway";

describe("ChatGPT subscription gateway", () => {
  test("exposes LiteLLM Responses models through Mastra", async () => {
    const gateway = new ChatGptSubscriptionGateway({
      baseUrl: "http://127.0.0.1:4000/v1/",
      models: ["gpt-5.4"],
    });

    const providers = await gateway.fetchProviders();
    expect(providers.chatgpt.models).toEqual(["gpt-5.4"]);
    expect(gateway.buildUrl()).toBe("http://127.0.0.1:4000/v1");

    const model = gateway.resolveLanguageModel({
      modelId: "gpt-5.4",
      providerId: "chatgpt",
    });
    expect(model.provider).toBe("chatgpt-subscription.responses");
    expect(model.modelId).toBe("chatgpt/gpt-5.4");
  });

  test("forwards only function tools supported by the LiteLLM ChatGPT route", async () => {
    const originalFetch = globalThis.fetch;
    const upstreamFetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(String(init?.body), { status: 200 }));
    globalThis.fetch = upstreamFetch as unknown as typeof globalThis.fetch;
    try {
      const response = await fetchChatGptSubscription("http://litellm/v1/responses", {
        method: "POST",
        body: JSON.stringify({
          tools: [
            { type: "code_interpreter", container: { type: "auto" } },
            { type: "function", name: "lookup", parameters: { type: "object" } },
          ],
        }),
      });
      const payload = JSON.parse(await response.text()) as {
        tools: Array<Record<string, unknown>>;
      };

      expect(payload.tools).toEqual([{
        type: "function",
        name: "lookup",
        parameters: { type: "object" },
        strict: false,
      }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
