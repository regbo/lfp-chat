"use client";

import { ChartNoAxesCombined, ListTodo } from "lucide-react";

import { ChatApp } from "@/components/chat-app";
import { TasksPanel } from "@/components/tasks-panel";
import type { AppBranding } from "@/lib/app-branding";
import type { UserScope } from "@/lib/user-scope";

const mods = [{
  id: "workspace",
  views: [{ id: "tasks", label: "Tasks", href: "/tasks", icon: <ListTodo />, content: <TasksPanel /> }],
  tools: [
    { id: "render_chart", title: "Charts", description: "Render interactive charts from retrieved data.", icon: <ChartNoAxesCombined />, defaultEnabled: true },
    { id: "tasks", title: "Tasks", description: "Create, organize, update, and review tasks.", icon: <ListTodo />, defaultEnabled: true },
  ],
}] as const;

export function WorkspaceChatApp({ branding, user }: { branding: AppBranding; user?: UserScope }) {
  return <ChatApp branding={branding} mods={mods} user={user} />;
}
