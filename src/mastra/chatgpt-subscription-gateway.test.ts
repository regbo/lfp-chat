import { describe, expect, test } from "bun:test";

import { ChatGptSubscriptionGateway } from "./chatgpt-subscription-gateway";

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
});
