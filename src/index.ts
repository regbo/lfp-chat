"use client";

import { ChatApp as ChatAppComponent } from "./components/chat-app";
import { TasksPanel as TasksPanelComponent } from "./components/tasks-panel";

export const ChatApp = ChatAppComponent;
export const TasksPanel = TasksPanelComponent;
export type { ChatAppProps } from "./components/chat-app";
export { createAppBranding, DEFAULT_APP_BRANDING, LFP_BRAND_COLORS } from "./lib/app-branding";
export type { AppBranding, AppBrandingOptions } from "./lib/app-branding";
export type {
  ChatAppMod,
  ChatAppPlugin,
  ChatAppToolContribution,
} from "./lib/chat-app-plugins";
export type { Task, TaskLink, TaskList } from "./lib/tasks";
