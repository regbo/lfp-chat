import {
  LocalFilesystem,
  LocalSandbox,
  Workspace,
} from "@mastra/core/workspace";

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
  operationTimeout: 120_000,
});
