import {
  LocalFilesystem,
  LocalSandbox,
  Workspace,
} from "@mastra/core/workspace";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Code mode intentionally runs on the host and can reach paths outside the
 * project. It is attached to the agent only when the user enables Code mode.
 */
export const hostWorkspace = new Workspace({
  id: "lfp-host-code-mode",
  name: "Host code mode",
  filesystem: new LocalFilesystem({
    id: "lfp-host-filesystem",
    basePath: process.cwd(),
    contained: false,
  }),
  sandbox: new LocalSandbox({
    id: "lfp-host-sandbox",
    workingDirectory: process.cwd(),
    isolation: "none",
    timeout: 120_000,
  }),
  tools: {
    mastra_workspace_read_file: { maxOutputTokens: 2_000 },
    mastra_workspace_list_files: { maxOutputTokens: 2_000 },
    mastra_workspace_grep: { maxOutputTokens: 2_000 },
    mastra_workspace_execute_command: { maxOutputTokens: 2_000 },
    mastra_workspace_get_process_output: { maxOutputTokens: 2_000 },
  },
  operationTimeout: 120_000,
});

/** A contained scratch area for AgentController plan files and approvals. */
export const planWorkspace = new Workspace({
  id: "lfp-plan-workspace",
  name: "Plan workspace",
  filesystem: new LocalFilesystem({
    id: "lfp-plan-filesystem",
    basePath: join(tmpdir(), "lfp-chat-plans"),
    contained: true,
  }),
  operationTimeout: 30_000,
});
