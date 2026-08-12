"use client";

import { ChatApp as ChatAppComponent } from "./components/chat-app";
import { TasksPanel as TasksPanelComponent } from "./components/tasks-panel";

export const ChatApp = ChatAppComponent;
export const TasksPanel = TasksPanelComponent;
export type { ChatAppProps } from "./components/chat-app";
export type {
  ChatAppMod,
  ChatAppPlugin,
  ChatAppToolContribution,
} from "./lib/chat-app-plugins";
export type { Task, TaskLink, TaskList } from "./lib/tasks";
