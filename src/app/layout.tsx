import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · Workspace" },
  description: "Tasks, docs and team context in one place",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
