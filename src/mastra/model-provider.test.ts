import { describe, expect, test } from "bun:test";
import { RequestContext } from "@mastra/core/request-context";

import { SCHEDULE_JOB_CONTEXT_KEY } from "@/lib/schedules";
import {
  resolveChartModel,
  resolveRuntimeModel,
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

    expect(resolveRuntimeModel(new RequestContext())).toBe("openai/gpt-5.6-luna");
    expect(resolveChartModel()).toBe("openai/gpt-5.6-luna");
  });
});
