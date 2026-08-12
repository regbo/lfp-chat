import type { ReactNode } from "react";

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
