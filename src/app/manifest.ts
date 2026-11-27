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
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      // the mark sits well inside the square, so Android can crop it into any icon shape
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
