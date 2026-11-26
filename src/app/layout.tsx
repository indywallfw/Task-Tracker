import type { Metadata, Viewport } from "next";
import { getTheme, THEME_COLORS } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · Workspace" },
  description: "Tasks, docs and team context in one place",
  applicationName: "Workspace",
  appleWebApp: { capable: true, title: "Workspace", statusBarStyle: "black-translucent" },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: theme === "light" ? THEME_COLORS.light : THEME_COLORS.dark,
  };
}

// "Match this device": pick light or dark before the first paint, and follow later changes.
const SYSTEM_THEME_SCRIPT = `(function(){var m=window.matchMedia('(prefers-color-scheme: dark)');function a(){document.documentElement.classList.toggle('dark',m.matches)}a();m.addEventListener('change',a)})()`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await getTheme();
  return (
    <html lang="en" className={`h-full antialiased ${theme === "dark" ? "dark" : ""}`} suppressHydrationWarning>
      <head>{theme === "system" && <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />}</head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
