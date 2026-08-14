export const LFP_BRAND_COLORS = {
  coral: "#ff6f61",
  coralHover: "#e85c50",
  ink: "#0b1426",
  softCoral: "#fff0ec",
  warmWhite: "#fff9f5",
} as const;

export type AppBranding = {
  /** Full product identity used in page titles, manifests, and assistant identity. */
  fullName: string;
  /** Compact suffix rendered beside the fixed LFP monogram. */
  shortName: string;
  /** Browser icon URL. Root-relative paths and HTTPS URLs are supported. */
  faviconUrl: string;
  /** @deprecated Use fullName. */
  displayName: string;
  /** @deprecated Use shortName. */
  productName: string;
};

export type AppBrandingOptions = {
  shortName?: string;
  fullName?: string;
  faviconUrl?: string;
};

const DEFAULT_FAVICON_URL = "/home-icon.svg?v=4";

function titleCase(value: string) {
  return value.replace(/(^|[ -])([a-z])/g, (_, boundary: string, letter: string) =>
    `${boundary}${letter.toUpperCase()}`,
  );
}

export function createAppBranding(
  options: string | AppBrandingOptions = {},
): AppBranding {
  const values = typeof options === "string" ? { shortName: options } : options;
  const shortName = (values.shortName || "chat").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9 -]{0,23}$/.test(shortName)) {
    throw new Error("APP_SHORT_NAME must be 1-24 lowercase letters, numbers, spaces, or hyphens.");
  }

  const fullName = (values.fullName || `LFP ${titleCase(shortName)}`)
    .trim()
    .replace(/\s+/g, " ");
  if (!fullName || fullName.length > 64 || /[\u0000-\u001f\u007f<>]/.test(fullName)) {
    throw new Error("APP_FULL_NAME must be 1-64 characters without markup or control characters.");
  }

  const faviconUrl = values.faviconUrl?.trim() || DEFAULT_FAVICON_URL;
  if (
    (!faviconUrl.startsWith("/") || faviconUrl.startsWith("//")) &&
    !faviconUrl.startsWith("https://")
  ) {
    throw new Error("APP_FAVICON_URL must be a root-relative path or HTTPS URL.");
  }

  return {
    fullName,
    shortName,
    faviconUrl,
    displayName: fullName,
    productName: shortName,
  };
}

export const DEFAULT_APP_BRANDING = createAppBranding();
