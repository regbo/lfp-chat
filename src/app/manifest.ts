import type { MetadataRoute } from "next";

import { LFP_BRAND_COLORS } from "@/lib/app-branding";
import { serverConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: serverConfig.appBranding.fullName,
    short_name: serverConfig.appBranding.fullName,
    description: "A tool-capable Mastra chat with persistent memory.",
    start_url: "/",
    display: "standalone",
    background_color: LFP_BRAND_COLORS.warmWhite,
    theme_color: LFP_BRAND_COLORS.warmWhite,
    orientation: "portrait-primary",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/home-icon.svg?v=4",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png?v=4",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=4",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
