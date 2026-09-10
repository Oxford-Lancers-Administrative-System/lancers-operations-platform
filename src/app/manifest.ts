import type { MetadataRoute } from "next";

import { CLUB_NAME, CLUB_NAVY, SITE_DESCRIPTION } from "@/lib/brand";

/**
 * What "Add to Home Screen" installs — LAN-269 item 2.
 *
 * Players are given a durable link (`/me/[token]`) and will pin it. Without a
 * manifest a pinned page takes a screenshot of the tab as its icon and the page
 * title as its label, which is how a player ends up with an unlabelled white
 * square. With one they get the crest and the word "Lancers".
 *
 * `short_name` is what fits under an icon on a phone home screen — roughly a
 * dozen characters before the launcher truncates it — so it is the club's
 * short name, not its full one.
 *
 * `start_url` is the front door and not a token link: the manifest is served
 * from a fixed path and is the same document for everybody, so it cannot carry
 * anything personal. A player pinning their own page keeps their own URL
 * regardless; this is only what a bare install opens.
 *
 * `display: "browser"` is deliberate. `standalone` strips the address bar and
 * the back button, and these are ordinary web pages a player follows links out
 * of — to a WhatsApp group, to a map, to the club's own calendar feed. Taking
 * away the browser's controls would strand them.
 *
 * The two icon sizes are the ones Android asks for: 192 for the launcher, 512
 * for the splash screen and the install prompt. Both are the gold-outline mark
 * on the club navy, cut by `scripts/generate-brand-assets.mjs` from the same
 * source as the favicon, so the tab and the home screen agree.
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
