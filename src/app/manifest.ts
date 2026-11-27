import type { MetadataRoute } from "next";
import { THEME_COLORS } from "@/lib/theme";

/** Lets phones "Add to Home Screen" / "Install app" and open it full-screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IndypenDance",
    short_name: "IndypenDance",
    description: "Tasks, docs, leads and calendar for the team",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME_COLORS.dark,
    theme_color: THEME_COLORS.dark,
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // full-bleed navy with the mark inside the safe zone, so Android can crop it into any shape
      { src: "/brand/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/mono-192.png", sizes: "192x192", type: "image/png", purpose: "monochrome" },
    ],
  };
}
