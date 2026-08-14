"use client";

import { ChartNoAxesCombined, ListTodo } from "lucide-react";

import { ChatApp } from "@/components/chat-app";
import { TasksPanel } from "@/components/tasks-panel";
import type { AppBranding } from "@/lib/app-branding";
import type { UserScope } from "@/lib/user-scope";

const coreMods = [{
  id: "workspace",
  tools: [{ id: "render_chart", title: "Charts", description: "Render interactive charts from retrieved data.", icon: <ChartNoAxesCombined />, defaultEnabled: true }],
}] as const;

const taskMods = [{
  id: "tasks",
  views: [{ id: "tasks", label: "Tasks", href: "/tasks", icon: <ListTodo />, content: <TasksPanel /> }],
  tools: [{ id: "tasks", title: "Tasks", description: "Create, organize, update, and review tasks.", icon: <ListTodo />, defaultEnabled: true }],
}] as const;

export function WorkspaceChatApp({ branding, taskServiceConfigured, user }: { branding: AppBranding; taskServiceConfigured: boolean; user?: UserScope }) {
  return <ChatApp branding={branding} mods={taskServiceConfigured ? [...coreMods, ...taskMods] : coreMods} user={user} />;
}
