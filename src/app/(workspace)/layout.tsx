import { HomeChatApp } from "@/components/home-chat-app";
import { resolvePageUserScope } from "@/lib/user-scope";
import { headers } from "next/headers";

export default async function WorkspaceLayout() {
  const user = await resolvePageUserScope(await headers());
  return <HomeChatApp user={user} />;
}
