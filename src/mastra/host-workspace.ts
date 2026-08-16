import {
  LocalFilesystem,
  LocalSandbox,
  Workspace,
  WORKSPACE_TOOLS,
} from "@mastra/core/workspace";
import { createHash } from "node:crypto";
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

const planWorkspaces = new Map<string, Workspace>();

function planResourceKey(resourceId: string) {
  return createHash("sha256").update(resourceId).digest("base64url").slice(0, 24);
}

/**
 * Mastra Code gives Plan mode a contained, read-only workspace plus one safe
 * markdown writer. Scope the workspace per resource so submitted plans cannot
 * cross user boundaries when the host later enables authenticated identities.
 */
export function planWorkspaceForResource(resourceId: string) {
  const key = planResourceKey(resourceId);
  const existing = planWorkspaces.get(key);
  if (existing) return existing;
  const workspace = new Workspace({
    id: `lfp-plan-${key}`,
    name: "Plan workspace",
    filesystem: new LocalFilesystem({
      id: `lfp-plan-filesystem-${key}`,
      basePath: join(tmpdir(), "lfp-chat-plans", key),
      contained: true,
    }),
    tools: {
      enabled: false,
      [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: {
        enabled: true,
        name: "view",
        maxOutputTokens: 4_000,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: {
        enabled: true,
        name: "find_files",
        maxOutputTokens: 2_000,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.GREP]: {
        enabled: true,
        name: "search_content",
        maxOutputTokens: 2_000,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
        enabled: true,
        name: "write_file",
        requireApproval: false,
      },
    },
    operationTimeout: 30_000,
  });
  planWorkspaces.set(key, workspace);
  return workspace;
}
