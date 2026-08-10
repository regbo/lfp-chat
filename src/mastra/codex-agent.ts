import { AcpAgent } from "@mastra/acp";
import { Agent } from "@mastra/core/agent";
import { LocalFilesystem, Workspace } from "@mastra/core/workspace";
import { resolve } from "node:path";

import { serverConfig } from "@/lib/config";
import {
  resolveRuntimeModel,
  resolveRuntimeOptions,
} from "@/mastra/model-provider";

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
    workspace: codexWorkspace,
    instructions: `You are the supervisor for the Codex CLI coding agent.

Delegate every user request to codexCli. Include the user's complete request and any relevant conversation context. Do not attempt the task yourself and do not call unrelated tools. Return the Codex result directly and concisely. The Codex workspace is restricted to ${serverConfig.codexWorkspacePath}.`,
    defaultOptions: ({ requestContext }) => ({
      ...resolveRuntimeOptions(requestContext),
      maxSteps: 4,
    }),
  });
}
