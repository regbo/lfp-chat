"use client";

import { ListTodo } from "lucide-react";

import { ChatApp } from "@/components/chat-app";
import { TasksPanel } from "@/components/tasks-panel";

const plugins = [
  { id: "tasks", label: "Tasks", icon: <ListTodo />, content: <TasksPanel /> },
] as const;

export function HomeChatApp({ initialThreadId }: { initialThreadId?: string }) {
  return <ChatApp initialThreadId={initialThreadId} plugins={plugins} />;
}
