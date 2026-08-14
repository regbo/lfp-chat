import { describe, expect, test } from "bun:test";
import { RequestContext } from "@mastra/core/request-context";

import { TOOL_MODEL_SELECTIONS_CONTEXT_KEY } from "@/lib/model-catalog";
import { SCHEDULE_JOB_CONTEXT_KEY } from "@/lib/schedules";
import {
  resolveChartModel,
  resolveChartProviderOptions,
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

    const toolOverride = new RequestContext();
    toolOverride.set(TOOL_MODEL_SELECTIONS_CONTEXT_KEY, {
      render_chart: {
        modelId: "openai/gpt-5.4-mini",
        reasoningEffort: "low",
      },
    });
    expect(resolveChartModel(toolOverride)).toBe("openai/gpt-5.4-mini");
    expect(resolveChartProviderOptions(toolOverride)).toEqual({
      openai: { reasoningEffort: "low" },
    });
  });
});
