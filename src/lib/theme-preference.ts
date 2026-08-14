export const THEME_STORAGE_KEY = "lfp-chat-theme";
export const THEME_CHANGE_EVENT = "lfp-chat-theme-change";

export type ThemePreference = "auto" | "light" | "dark";

export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  try {
    const stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    const preference = stored === "light" || stored === "dark" ? stored : "auto";
    const dark = preference === "dark" || (preference === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = preference;
    document.documentElement.classList.toggle("dark", dark);
  } catch {}
})();`;

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function applyThemePreference(preference: ThemePreference) {
  const dark = preference === "dark" || (
    preference === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  document.documentElement.dataset.theme = preference;
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => { meta.content = dark ? "#252525" : "#ffffff"; });
}

export function saveThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The preference still applies for the lifetime of this page.
  }
  applyThemePreference(preference);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
