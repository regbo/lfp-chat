import { WorkspaceChatApp } from "@/components/workspace-chat-app";
import { resolvePageUserScope } from "@/lib/user-scope";
import { serverConfig } from "@/lib/config";
import { defaultRegisteredTools } from "@/lib/tool-catalog";
import { headers } from "next/headers";

export default async function WorkspaceLayout() {
  const user = await resolvePageUserScope(await headers());
  return <WorkspaceChatApp
    branding={serverConfig.appBranding}
    externalViews={serverConfig.externalViews}
    taskServiceConfigured={serverConfig.taskServiceConfigured}
    toolPolicies={serverConfig.toolPolicyOverrides}
    tools={[
      ...Object.values(defaultRegisteredTools).filter(
        (tool) => tool.id !== "tasks" || serverConfig.taskServiceConfigured,
      ),
      ...serverConfig.mcpToolSources,
    ]}
    user={user}
  />;
}
