import { describe, expect, test } from "bun:test";
import { RequestContext } from "@mastra/core/request-context";

import { SCHEDULE_JOB_CONTEXT_KEY } from "@/lib/schedules";
import {
  resolveBackgroundModel,
  resolveRuntimeModel,
  resolveRuntimeOptions,
} from "@/mastra/model-provider";

describe("model provider isolation", () => {
  test("routes scheduled work to local Ollama and chat to the configured provider", () => {
    const scheduled = new RequestContext();
    scheduled.set(SCHEDULE_JOB_CONTEXT_KEY, true);

    const scheduledModel = resolveRuntimeModel(scheduled);
    expect(typeof scheduledModel).toBe("object");
    if (typeof scheduledModel === "object") {
      expect(scheduledModel.provider).toBe("ollama.chat");
    }

    expect(resolveBackgroundModel().provider).toBe("web-ollama.chat");

    expect(resolveRuntimeModel(new RequestContext())).toBe("openai/gpt-5.6-luna");
  });

  test("keeps Responses history portable across API-key and subscription models", () => {
    for (const modelId of [
      "openai/gpt-5.6-luna",
      "subscription/chatgpt/gpt-5.6-sol",
    ]) {
      const requestContext = new RequestContext();
      requestContext.set("controller", { session: { modelId } });
      expect(
        resolveRuntimeOptions(requestContext).providerOptions?.openai?.store,
      ).toBe(false);
    }
  });
});
