"use client";

import { Landmark, ListTodo } from "lucide-react";

import { ChatApp } from "@/components/chat-app";
import { TasksPanel } from "@/components/tasks-panel";
import type { AppBranding } from "@/lib/app-branding";
import type { UserScope } from "@/lib/user-scope";
import type { ToolPolicyOverride } from "@/lib/config";
import type { ExternalViewConfig } from "@/lib/config";
import type { ChatAppToolContribution } from "@/lib/chat-app-plugins";

const taskMods = [{
  id: "tasks",
  views: [{ id: "tasks", label: "Tasks", href: "/tasks", icon: <ListTodo />, content: <TasksPanel /> }],
}] as const;

function ExternalView({ label, source }: Pick<ExternalViewConfig, "label" | "source">) {
  return <iframe className="h-full min-h-0 w-full border-0" src={source} title={label} />;
}

export function WorkspaceChatApp({ branding, externalViews, taskServiceConfigured, toolPolicies, tools, user }: { branding: AppBranding; externalViews: readonly ExternalViewConfig[]; taskServiceConfigured: boolean; toolPolicies: Record<string, ToolPolicyOverride>; tools: readonly ChatAppToolContribution[]; user?: UserScope }) {
  const externalMods = externalViews.map((view) => ({
    id: `external-${view.id}`,
    views: [{
      id: view.id,
      label: view.label,
      href: view.href,
      icon: <Landmark />,
      content: <ExternalView label={view.label} source={view.source} />,
    }],
  }));
  const mods = [...(taskServiceConfigured ? taskMods : []), ...externalMods];
  return <ChatApp branding={branding} mods={mods} toolPolicies={toolPolicies} tools={tools} user={user} />;
}
