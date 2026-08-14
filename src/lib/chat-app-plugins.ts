import type { ReactNode } from "react";

import type { ReasoningEffort } from "@/lib/model-catalog";

export type DedicatedToolModelConfig = {
  /** Model-router id used when this device has not saved a preference. */
  defaultModelId: string;
  /** Tool-specific reasoning default. Use none for low-latency transforms. */
  defaultReasoningEffort?: ReasoningEffort | null;
  /** Optional copy shown under this tool in Settings. */
  description?: string;
};

/** A self-contained view contributed to ChatApp's primary navigation. */
export type ChatAppPlugin = {
  /** Stable identity used to preserve the selected view across renders. */
  id: string;
  /** User-facing text shown in the sidebar and view header. */
  label: string;
  /** Route rendered for this view. Defaults to `/${id}`. */
  href?: `/${string}`;
  /** Optional navigation artwork. SVGs inherit the standard menu icon size. */
  icon?: ReactNode;
  /** The panel rendered when the plugin's menu item is selected. */
  content: ReactNode;
};

/** A capability supplied by a host mod and implemented by its Mastra server. */
export type ChatAppToolContribution = {
  id: string;
  title: string;
  description: string;
  icon?: ReactNode;
  defaultEnabled?: boolean;
  dangerous?: boolean;
  /** Adds an isolated, reusable model picker for this tool in Settings. */
  dedicatedModel?: DedicatedToolModelConfig;
};

/** App-wide extension bundle supplied without patching ChatApp internals. */
export type ChatAppMod = {
  id: string;
  /** Routed views added to primary navigation. */
  views?: readonly ChatAppPlugin[];
  /** Sections appended to the Settings route. */
  settings?: ReactNode;
  /** Client catalog entries whose matching tools are registered by the host. */
  tools?: readonly ChatAppToolContribution[];
};

const reservedRoutes = new Set([
  "/",
  "/archived",
  "/scheduled",
  "/search",
  "/settings",
  "/tools",
]);

export function validateChatAppPlugins(
  plugins: readonly ChatAppPlugin[],
): readonly ChatAppPlugin[] {
  const ids = new Set<string>();
  const routes = new Set<string>();

  for (const plugin of plugins) {
    if (!plugin.id.trim()) {
      throw new Error("ChatApp plugin ids must not be empty.");
    }
    if (!plugin.label.trim()) {
      throw new Error(`ChatApp plugin "${plugin.id}" must have a label.`);
    }
    if (ids.has(plugin.id)) {
      throw new Error(`ChatApp plugin id "${plugin.id}" is registered more than once.`);
    }
    const route = plugin.href ?? `/${plugin.id}`;
    if (
      !/^\/(?!\/)[^?#]*$/.test(route) ||
      route === "/c" ||
      route.startsWith("/c/")
    ) {
      throw new Error(`ChatApp plugin "${plugin.id}" must use a root-relative route.`);
    }
    if (reservedRoutes.has(route)) {
      throw new Error(`ChatApp plugin "${plugin.id}" cannot use reserved route "${route}".`);
    }
    if (routes.has(route)) {
      throw new Error(`ChatApp plugin route "${route}" is registered more than once.`);
    }
    ids.add(plugin.id);
    routes.add(route);
  }

  return plugins;
}

export function validateChatAppMods(mods: readonly ChatAppMod[]) {
  const modIds = new Set<string>();
  const toolIds = new Set<string>();
  const views = mods.flatMap((mod) => {
    if (!mod.id.trim()) throw new Error("ChatApp mod ids must not be empty.");
    if (modIds.has(mod.id)) {
      throw new Error(`ChatApp mod id "${mod.id}" is registered more than once.`);
    }
    modIds.add(mod.id);
    for (const tool of mod.tools ?? []) {
      if (!tool.id.trim() || !tool.title.trim() || !tool.description.trim()) {
        throw new Error(`ChatApp mod "${mod.id}" has an incomplete tool contribution.`);
      }
      if (
        tool.dedicatedModel &&
        !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(
          tool.dedicatedModel.defaultModelId,
        )
      ) {
        throw new Error(
          `ChatApp tool "${tool.id}" has an invalid dedicated model id.`,
        );
      }
      if (toolIds.has(tool.id)) {
        throw new Error(`ChatApp tool id "${tool.id}" is registered more than once.`);
      }
      toolIds.add(tool.id);
    }
    return [...(mod.views ?? [])];
  });
  validateChatAppPlugins(views);
  return mods;
}
