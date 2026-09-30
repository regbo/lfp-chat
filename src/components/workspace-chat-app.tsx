"use client";

import { ListTodo } from "lucide-react";

import { ChatApp } from "@/components/chat-app";
import { TasksPanel } from "@/components/tasks-panel";
import type { AppBranding } from "@/lib/app-branding";
import type { UserScope } from "@/lib/user-scope";
import type { ToolPolicyOverride } from "@/lib/config";
import type { ChatAppToolContribution } from "@/lib/chat-app-plugins";

const taskMods = [{
  id: "tasks",
  views: [{ id: "tasks", label: "Tasks", href: "/tasks", icon: <ListTodo />, content: <TasksPanel /> }],
}] as const;

export function WorkspaceChatApp({ branding, taskServiceConfigured, toolPolicies, tools, user }: { branding: AppBranding; taskServiceConfigured: boolean; toolPolicies: Record<string, ToolPolicyOverride>; tools: readonly ChatAppToolContribution[]; user?: UserScope }) {
  const mods = taskServiceConfigured ? taskMods : [];
  return <ChatApp branding={branding} mods={mods} toolPolicies={toolPolicies} tools={tools} user={user} />;
}
