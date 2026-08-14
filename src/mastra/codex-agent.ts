import { AcpAgent } from "@mastra/acp";
import { Agent } from "@mastra/core/agent";
import { LocalFilesystem, Workspace } from "@mastra/core/workspace";
import { resolve } from "node:path";

import { serverConfig } from "@/lib/config";
import { SCHEDULE_JOB_CONTEXT_KEY } from "@/lib/schedules";
import { jobMemoryRecallTool } from "@/mastra/job-memory-tool";
import {
  resolveRuntimeModel,
  resolveRuntimeOptions,
} from "@/mastra/model-provider";
import { DEFAULT_WRITING_STYLE_INSTRUCTIONS } from "@/mastra/writing-style-instructions";

function getCodexAcpCommand() {
  if (serverConfig.codexAcpCommand) return serverConfig.codexAcpCommand;
  return resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "codex-acp.exe" : "codex-acp",
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
  authMethodId: "api-key",
  persistSession: false,
  env: {
    NO_BROWSER: "1",
    INITIAL_AGENT_MODE: serverConfig.codexAgentMode,
    DEFAULT_AUTH_REQUEST: JSON.stringify({ methodId: "api-key" }),
  },
});

export function createCodexAgent(memory: ConstructorParameters<typeof Agent>[0]["memory"]) {
  return new Agent({
    id: "codexAgent",
    name: "Codex CLI",
    description: "A coding assistant backed by the Codex CLI over ACP.",
    model: ({ requestContext }) => resolveRuntimeModel(requestContext),
    memory,
    agents: { codexCli },
    tools: ({ requestContext }) =>
      Object.fromEntries(
        requestContext.get(SCHEDULE_JOB_CONTEXT_KEY) === true
          ? [["job_memory_recall", jobMemoryRecallTool]]
          : [],
      ),
    workspace: codexWorkspace,
    instructions: ({ requestContext }) => `You are the supervisor for the Codex CLI coding agent.

${requestContext.get(SCHEDULE_JOB_CONTEXT_KEY) === true ? "This is a scheduled job. When its result depends on prior runs or must not repeat them, call job_memory_recall first and include the relevant job history in the delegation." : ""}
Delegate every user request to codexCli. Include the user's complete request, any relevant conversation context, and the default writing rules below. Do not attempt the task yourself and do not call unrelated tools. Return the Codex result directly. The Codex workspace is restricted to ${serverConfig.codexWorkspacePath}.

${DEFAULT_WRITING_STYLE_INSTRUCTIONS}`,
    defaultOptions: ({ requestContext }) => ({
      ...resolveRuntimeOptions(requestContext),
      maxSteps: 4,
    }),
  });
}
