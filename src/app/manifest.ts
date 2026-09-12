import type { MetadataRoute } from "next";

import { CLUB_NAME, CLUB_NAVY, SITE_DESCRIPTION } from "@/lib/brand";

/**
 * What "Add to Home Screen" installs — LAN-269 item 2. Without this, a pinned
 * `/events/[token]` takes a tab screenshot as its icon and the page title as its
 * label. `start_url` is the front door, not a token link: the manifest is one
 * document for everybody. `display: "browser"` is deliberate — these are
 * ordinary pages a player follows links out of, and `standalone` would strand
 * them by stripping the address bar.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: CLUB_NAME,
    short_name: "Lancers",
    description: SITE_DESCRIPTION,
    lang: "en-GB",
    start_url: "/",
    display: "browser",
    background_color: CLUB_NAVY,
    theme_color: CLUB_NAVY,
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
