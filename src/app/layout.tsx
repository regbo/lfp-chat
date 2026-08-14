import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeSync } from "@/components/theme-sync";
import { THEME_BOOTSTRAP_SCRIPT, THEME_COLORS } from "@/lib/theme-preference";
import { serverConfig } from "@/lib/config";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: serverConfig.appBranding.fullName,
    description: "A Mastra chat interface with PostgreSQL-backed memory.",
    applicationName: serverConfig.appBranding.fullName,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: serverConfig.appBranding.fullName,
    },
    icons: {
      icon: serverConfig.appBranding.faviconUrl,
      apple: "/apple-touch-icon.png?v=4",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <ThemeSync />
        <PwaRegister />
      </body>
    </html>
  );
}
