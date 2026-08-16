import { AcpAgent } from "@mastra/acp";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { LocalFilesystem, Workspace } from "@mastra/core/workspace";
import { resolve } from "node:path";
import { z } from "zod";

import { serverConfig } from "@/lib/config";
import { SCHEDULE_JOB_CONTEXT_KEY } from "@/lib/schedules";
import { jobMemoryRecallTool } from "@/mastra/job-memory-tool";
import {
  resolveRuntimeModel,
  resolveRuntimeOptions,
} from "@/mastra/model-provider";
import { DEFAULT_WRITING_STYLE_INSTRUCTIONS } from "@/mastra/writing-style-instructions";
import { OpenAiConversationStateProcessor } from "@/mastra/openai-conversation-state";

function getCodexAcpCommand() {
  if (serverConfig.codexAcpCommand) return serverConfig.codexAcpCommand;
  return resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "codex-acp.exe" : "codex-acp",
  );
}

function getCodexCommand() {
  if (serverConfig.codexCommand) return serverConfig.codexCommand;
  return resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "codex.exe" : "codex",
  );
}

const codexWorkspace = new Workspace({
  id: "lfp-codex-workspace",
  filesystem: new LocalFilesystem({
    basePath: serverConfig.codexWorkspacePath,
  }),
});

const codexCli = new AcpAgent({
  id: "codexCli",
  name: "Codex CLI",
  description:
    "OpenAI Codex coding agent with file, shell, Git, reasoning, and tool capabilities.",
  command: getCodexAcpCommand(),
  cwd: serverConfig.codexWorkspacePath,
  workspace: codexWorkspace,
  // codex-acp launches app-server and explicitly verifies ChatGPT account auth
  // before opening the durable ACP session. Empty key variables prevent an
  // inherited API key from becoming an accidental fallback.
  authMethodId: "chat-gpt",
  persistSession: true,
  env: {
    CODEX_PATH: getCodexCommand(),
    CODEX_API_KEY: "",
    OPENAI_API_KEY: "",
    INITIAL_AGENT_MODE: serverConfig.codexAgentMode,
  },
});

const codexAppServerTool = createTool({
  id: "codex_app_server",
  description:
    "Run a task in the current workspace with the subscription-backed Codex app-server.",
  inputSchema: z.object({
    prompt: z.string().min(1).max(50_000),
  }),
  outputSchema: z.object({
    text: z.string(),
    events: z.array(z.unknown()),
  }),
  toModelOutput: (output) => ({
    type: "text",
    value: output.text,
  }),
  execute: async ({ prompt }, context) => {
    const result = await codexCli.stream(prompt, {
      abortSignal: context?.abortSignal,
    });
    const events: unknown[] = [];

    const reader = result.fullStream.getReader();
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        // Keep the parent agent's lifecycle authoritative while preserving the
        // Codex reasoning, tool activity, and command output it can render.
        if (
          chunk.type === "start" ||
          chunk.type === "finish" ||
          chunk.type === "step-start" ||
          chunk.type === "step-finish" ||
          chunk.type === "text-start" ||
          chunk.type === "text-delta" ||
          chunk.type === "text-end"
        ) continue;
        if (events.length < 500) events.push(chunk);
        await context?.writer?.write(chunk);
      }
    } finally {
      reader.releaseLock();
    }

    return { text: await result.text, events };
  },
});

export function createCodexAgent(memory: ConstructorParameters<typeof Agent>[0]["memory"]) {
  const openAiConversationState = new OpenAiConversationStateProcessor();
  return new Agent({
    id: "codexAgent",
    name: "Codex (ChatGPT)",
    description:
      "A coding assistant backed by Codex app-server using ChatGPT subscription auth.",
    model: ({ requestContext }) => resolveRuntimeModel(requestContext),
    memory,
    inputProcessors: [openAiConversationState],
    outputProcessors: [openAiConversationState],
    errorProcessors: [openAiConversationState],
    tools: ({ requestContext }) =>
      Object.fromEntries(
        [
          ["codex_app_server", codexAppServerTool],
          ...(requestContext.get(SCHEDULE_JOB_CONTEXT_KEY) === true
            ? [["job_memory_recall", jobMemoryRecallTool]]
            : []),
        ],
      ),
    workspace: codexWorkspace,
    instructions: ({ requestContext }) => `You are the supervisor for the Codex CLI coding agent.

${requestContext.get(SCHEDULE_JOB_CONTEXT_KEY) === true ? "This is a scheduled job. When its result depends on prior runs or must not repeat them, call job_memory_recall first and include the relevant job history in the delegation." : ""}
Call codex_app_server exactly once for every user request. Put the user's complete request and any relevant conversation context in its prompt. Do not attempt the task yourself and do not call unrelated tools. Return the tool's text directly. The Codex workspace is restricted to ${serverConfig.codexWorkspacePath}.

${DEFAULT_WRITING_STYLE_INSTRUCTIONS}`,
    defaultOptions: ({ requestContext }) => ({
      ...resolveRuntimeOptions(requestContext),
      maxSteps: 4,
    }),
  });
}
