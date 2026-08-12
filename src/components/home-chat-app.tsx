"use client";

import { ListTodo } from "lucide-react";

import { ChatApp } from "@/components/chat-app";
import { TasksPanel } from "@/components/tasks-panel";

const plugins = [
  {
    id: "tasks",
    label: "Tasks",
    href: "/tasks",
    icon: <ListTodo />,
    content: <TasksPanel />,
  },
] as const;

export function HomeChatApp() {
  return <ChatApp plugins={plugins} />;
}
