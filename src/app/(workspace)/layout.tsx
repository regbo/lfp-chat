import { WorkspaceChatApp } from "@/components/workspace-chat-app";
import { resolvePageUserScope } from "@/lib/user-scope";
import { serverConfig } from "@/lib/config";
import { headers } from "next/headers";

export default async function WorkspaceLayout() {
  const user = await resolvePageUserScope(await headers());
  return <WorkspaceChatApp branding={serverConfig.appBranding} user={user} />;
}
