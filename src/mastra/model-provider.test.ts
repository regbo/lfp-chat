import { describe, expect, test } from "bun:test";
import { RequestContext } from "@mastra/core/request-context";

import { SCHEDULE_JOB_CONTEXT_KEY } from "@/lib/schedules";
import {
  openAiReasoningModelSettings,
  openAiReasoningProviderOptions,
  resolveBackgroundModel,
  resolveRuntimeModel,
} from "@/mastra/model-provider";

describe("model provider isolation", () => {
  test("requests visible reasoning summaries only when reasoning is enabled", () => {
    expect(openAiReasoningProviderOptions("medium")).toEqual({
      openai: {
        reasoningEffort: "medium",
        forceReasoning: true,
        reasoningSummary: "auto",
      },
    });
    expect(openAiReasoningProviderOptions("none")).toEqual({
      openai: { reasoningEffort: "none", forceReasoning: true },
    });
    expect(openAiReasoningProviderOptions(null)).toBeUndefined();
    expect(openAiReasoningModelSettings("high")).toEqual({ reasoning: "high" });
    expect(openAiReasoningModelSettings("max")).toEqual({ reasoning: "xhigh" });
    expect(openAiReasoningModelSettings(null)).toBeUndefined();
  });

  test("routes scheduled, background, and chat work to the hosted provider", () => {
    const scheduled = new RequestContext();
    scheduled.set(SCHEDULE_JOB_CONTEXT_KEY, true);

    expect(resolveRuntimeModel(scheduled)).toBe("openai/gpt-5.6-luna");
    expect(resolveBackgroundModel()).toBe("openai/gpt-5.6-luna");
    expect(resolveRuntimeModel(new RequestContext())).toBe("openai/gpt-5.6-luna");
  });
});
