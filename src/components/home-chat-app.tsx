"use client";

import { ChartNoAxesCombined, Database, ListTodo, Mail, Paperclip, Search, Share2 } from "lucide-react";

import { ChatApp } from "@/components/chat-app";
import { GmailSettings } from "@/components/gmail-settings";
import { TasksPanel } from "@/components/tasks-panel";
import type { UserScope } from "@/lib/user-scope";

const mods = [{
  id: "home",
  views: [
  {
    id: "tasks",
    label: "Tasks",
    href: "/tasks",
    icon: <ListTodo />,
    content: <TasksPanel />,
  },
  ],
  settings: <GmailSettings />,
  tools: [
    { id: "family_database", title: "Family database", description: "Query family records, accounts, balances, and transactions safely.", icon: <Database />, defaultEnabled: true },
    {
      id: "render_chart",
      title: "Charts",
      description: "Render interactive charts from retrieved data.",
      icon: <ChartNoAxesCombined />,
      defaultEnabled: true,
      dedicatedModel: {
        defaultModelId: "openai/gpt-5.6-luna",
        defaultReasoningEffort: "none",
        description: "Plans chart layout and series without changing the conversation model.",
      },
    },
    { id: "family_search", title: "Family search", description: "Search email and attachments using semantic and full-text retrieval.", icon: <Search />, defaultEnabled: true },
    { id: "family_graph", title: "Family graph", description: "Search document-derived temporal facts and relationships.", icon: <Share2 />, defaultEnabled: true },
    { id: "family_email", title: "Family email", description: "Retrieve original emails and inspect parsed content.", icon: <Mail />, defaultEnabled: true },
    { id: "family_attachment", title: "Family attachment", description: "Retrieve attachment text, metadata, or original bytes.", icon: <Paperclip />, defaultEnabled: true },
    { id: "tasks", title: "Tasks", description: "Create, organize, update, and review tasks.", icon: <ListTodo />, defaultEnabled: true },
  ],
}] as const;

export function HomeChatApp({ user }: { user?: UserScope }) {
  return <ChatApp mods={mods} user={user} />;
}
