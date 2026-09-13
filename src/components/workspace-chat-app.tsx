"use client";

import { useState } from "react";

import { Landmark, LayoutDashboard, ListTodo, LoaderCircle } from "lucide-react";

import { ChatApp } from "@/components/chat-app";
import { TasksPanel } from "@/components/tasks-panel";
import type { AppBranding } from "@/lib/app-branding";
import type { UserScope } from "@/lib/user-scope";
import type { ToolPolicyOverride } from "@/lib/config";
import type { ExternalViewConfig, WindmillEmbedViewConfig } from "@/lib/config";
import type { ChatAppToolContribution } from "@/lib/chat-app-plugins";

const taskMods = [{
  id: "tasks",
  views: [{ id: "tasks", label: "Tasks", href: "/tasks", icon: <ListTodo />, content: <TasksPanel /> }],
}] as const;

function ExternalView({ label, source }: Pick<ExternalViewConfig, "label" | "source">) {
  const [loading, setLoading] = useState(true);
  return <div className="relative min-h-0 w-full flex-1">
    {loading && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
      <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Loading {label}</span>
    </div>}
    <iframe
      className="absolute inset-0 size-full border-0"
      onLoad={() => setLoading(false)}
      src={source}
      title={label}
    />
  </div>;
}

export function WorkspaceChatApp({ branding, externalViews, taskServiceConfigured, toolPolicies, tools, user, windmillViews }: { branding: AppBranding; externalViews: readonly ExternalViewConfig[]; taskServiceConfigured: boolean; toolPolicies: Record<string, ToolPolicyOverride>; tools: readonly ChatAppToolContribution[]; user?: UserScope; windmillViews: readonly WindmillEmbedViewConfig[] }) {
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
  const windmillMods = windmillViews
    .filter((view) => view.placement === "navigation")
    .map((view) => ({
      id: `windmill-${view.id}`,
      views: [{
        id: view.id,
        label: view.label,
        href: view.href,
        icon: <Landmark />,
        content: <ExternalView label={view.label} source={`/api/windmill/apps/${view.id}`} />,
      }],
    }));
  const dashboard = windmillViews.find((view) => view.placement === "dashboard");
  const mods = [...(taskServiceConfigured ? taskMods : []), ...externalMods, ...windmillMods];
  return <ChatApp
    branding={branding}
    dashboardView={dashboard ? {
      id: dashboard.id,
      label: dashboard.label,
      icon: <LayoutDashboard />,
      content: <ExternalView label={dashboard.label} source={`/api/windmill/apps/${dashboard.id}`} />,
    } : undefined}
    mods={mods}
    toolPolicies={toolPolicies}
    tools={tools}
    user={user}
  />;
}
