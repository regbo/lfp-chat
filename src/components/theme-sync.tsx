"use client";

import { useEffect } from "react";

import {
  applyThemePreference,
  readThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
} from "@/lib/theme-preference";

export function ThemeSync() {
  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyThemePreference(readThemePreference());
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) sync();
    };

    sync();
    colorScheme.addEventListener("change", sync);
    window.addEventListener("storage", syncStoredTheme);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => {
      colorScheme.removeEventListener("change", sync);
      window.removeEventListener("storage", syncStoredTheme);
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
    };
  }, []);

  return null;
}
