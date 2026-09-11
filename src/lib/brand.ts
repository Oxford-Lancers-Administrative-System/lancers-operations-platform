import type { Metadata } from "next";

/**
 * The club's name, its navy, and the words a shared link shows — LAN-277.
 * One module: `manifest.ts`, the `opengraph-image` routes and the root layout
 * all import it, and two of those run in the edge-ish image runtime where a
 * component import would be dead weight.
 *
 * Decision history: docs/ux/design-system.md (LAN-277 has no ticket contract)
 */

/** As it is written everywhere the club names itself. Never "OULAFC" in chrome. */
export const CLUB_NAME = "Oxford Lancers";

/** Oxford Blue — `theme.palette.primary.main`, the masthead, the icon ground. */
export const CLUB_NAVY = "#002147";

/** The application mark. `public/brand/README.md` records where it came from. */
export const CREST_PATH = "/brand/crest.svg";

/** What a member reads when the app is shared (LAN-269, Brian's sentence). */
export const SITE_DESCRIPTION = "The Oxford Lancers club app: events, RSVPs and your details.";

/** LAN-279, Brian's defaults. Two strings: `JOIN_CARD_WORDS` for the card, `JOIN_TITLE` for the tab/search. */
export const JOIN_CARD_WORDS = "Join the Lancers";
export const JOIN_TITLE = "Join the Oxford Lancers";
export const JOIN_DESCRIPTION =
  "Sign up in under a minute: your name, phone and college email, and we'll send you the details.";

/** The public calendar's own sentence, shared by `/calendar` and `/calendar/view` — one noticeboard, two arrangements. */
export const CALENDAR_DESCRIPTION =
  "Every Oxford Lancers training session, fixture and social this season, with the details you need to turn up.";

/** Named rather than inherited: any route that sets `openGraph` must name this image back or lose it. `/join/[code]` has its own. */
const CLUB_CARD = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "The Oxford University Lancers American Football Club crest, over the club's ground",
};

/** The card every token link shows (LAN-269 item 5) — says nothing about the event, or a resolved token would leak liveness (ADR 0023). */
const TOKEN_LINK_SENTENCE = "A link from the Oxford Lancers. Open it to see what it is for.";

export const TOKEN_LINK_METADATA: Metadata = {
  title: { absolute: CLUB_NAME }, // `absolute`, or the root's template doubles the club name in the tab.
  description: TOKEN_LINK_SENTENCE,
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: CLUB_NAME,
    locale: "en_GB",
    title: CLUB_NAME,
    description: TOKEN_LINK_SENTENCE,
    images: [CLUB_CARD],
  },
  twitter: {
    card: "summary_large_image",
    title: CLUB_NAME,
    description: TOKEN_LINK_SENTENCE,
    images: [CLUB_CARD],
  },
};

/** A public page's own card (LAN-269 item 4). Next merges `openGraph` whole, so `title` alone would keep the root's card; `siteName` carries the club name, not `title`. */
export function publicPageMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: CLUB_NAME,
      locale: "en_GB",
      title,
      description,
      images: [CLUB_CARD],
    },
    twitter: { card: "summary_large_image", title, description, images: [CLUB_CARD] },
  };
}

/** Where this deployment answers, for `og:image`'s absolute URLs. `APP_BASE_URL` only, not `Host` (would opt out of static rendering). */
export function metadataBase(): URL | undefined {
  const configured = (process.env.APP_BASE_URL ?? "").trim();
  if (configured === "") return undefined;
  try {
    return new URL(configured);
  } catch {
    return undefined;
  }
}
