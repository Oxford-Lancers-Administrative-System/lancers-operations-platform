import type { Metadata } from "next";

/**
 * The club's name, its navy, and the words a shared link shows — LAN-277.
 *
 * One module because these strings appear in three unrelated places: the
 * masthead, the `<head>` of every page, and the images generated for link
 * previews. A wording change Brian asks for should be one edit, not a search.
 *
 * Deliberately free of MUI, React and `server-only`: `manifest.ts`, the
 * `opengraph-image` routes and the root layout all import it, and two of those
 * run in the edge-ish image runtime where a component import would be dead
 * weight at best.
 */

/** As it is written everywhere the club names itself. Never "OULAFC" in chrome. */
export const CLUB_NAME = "Oxford Lancers";

/** Oxford Blue — `theme.palette.primary.main`, the masthead, the icon ground. */
export const CLUB_NAVY = "#002147";

/** The application mark. `public/brand/README.md` records where it came from. */
export const CREST_PATH = "/brand/crest.svg";

/**
 * What a member reads when the app is shared — LAN-269, Brian's own sentence.
 *
 * It replaced "Oxford Lancers operations platform — infrastructure scaffold",
 * which is what WhatsApp had been showing to players since the first commit.
 */
export const SITE_DESCRIPTION = "The Oxford Lancers club app: events, RSVPs and your details.";

/**
 * The recruit sign-up door's wording — LAN-279, Brian's defaults.
 *
 * Two different strings on purpose. The card is looked at, on a phone, in a
 * chat, for about a second, so it carries the three words that say what tapping
 * it does. The title is read in a browser tab and a search result, where "the
 * Lancers" alone does not say which Lancers. Brian floated "Sign up" as the
 * alternative for the card; it is his to change, and changing it here changes
 * the image, the tab and the shared card together.
 */
export const JOIN_CARD_WORDS = "Join the Lancers";
export const JOIN_TITLE = "Join the Oxford Lancers";
export const JOIN_DESCRIPTION =
  "Sign up in under a minute: your name, phone and college email, and we'll send you the details.";

/**
 * The public calendar's own sentence, shared by its two arrangements.
 *
 * `/calendar` and `/calendar/view` are one noticeboard shown as a list and as a
 * month; a link to either should read the same in a chat.
 */
export const CALENDAR_DESCRIPTION =
  "Every Oxford Lancers training session, fixture and social this season, with the details you need to turn up.";

/**
 * The club-wide preview image, named rather than inherited.
 *
 * `src/app/opengraph-image.png` is a Next.js metadata *file*, and the framework
 * attaches it automatically — but only to routes that do not declare
 * `openGraph` of their own. Next replaces that object whole, and the image it
 * had put there goes with it: measured on a running server, `/calendar` and the
 * policy pages emitted `og:title` and `og:description` and no `og:image` at
 * all, which unfurls in WhatsApp as a bare line of text.
 *
 * So every route that sets `openGraph` names the image back. The path is the
 * stable address Next serves that file at; the `?<hash>` the framework appends
 * elsewhere is a cache buster, not part of the route. `/join/[code]` is the one
 * route that does not use this — it has its own image file in its own segment,
 * which is exactly the mechanism this works around.
 */
const CLUB_CARD = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "The Oxford University Lancers American Football Club crest, over the club's ground",
};

/**
 * The card every token link shows — LAN-269 item 5.
 *
 * ## Why it says nothing
 *
 * `/rsvp/[token]`, `/me/[token]`, `/a/[token]` and `/e/[token]` are the links
 * the club actually sends, and a link preview is not shown to the recipient: it
 * is shown to **everyone in the chat**, rendered from a crawler's fetch, and it
 * survives in the transcript. Anything the card carries is disclosed to that
 * whole audience, forever.
 *
 * LAN-269 permits "at most the event's name and date" here. This takes less
 * than it is allowed, for two reasons that are not about caution:
 *
 *   * **A card that varies is an oracle.** To name the event, the card has to
 *     resolve the token during `generateMetadata`. A live token would then
 *     unfurl differently from a revoked, expired or invented one, and LAN-90's
 *     uniform terminal response — which the page itself goes to some trouble to
 *     preserve, down to padding its own timing — would be readable from a chat
 *     bubble by anyone who ever saw the message.
 *   * **A card that resolves is a database read on an unauthenticated path,**
 *     performed for every crawler that ever sees the link, and the routes have
 *     just been made side-effect-free precisely so a crawler's fetch costs
 *     nothing and changes nothing.
 *
 * `robots` is belt and braces. These pages are not linked from anywhere a
 * search engine can reach, and a token is unguessable, but a player pasting
 * their own link into a public forum should not be able to get it indexed.
 */
const TOKEN_LINK_SENTENCE = "A link from the Oxford Lancers. Open it to see what it is for.";

export const TOKEN_LINK_METADATA: Metadata = {
  // `absolute`, or the root's `%s — Oxford Lancers` template turns the club's
  // own name into "Oxford Lancers — Oxford Lancers" in the tab.
  title: { absolute: CLUB_NAME },
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

/**
 * A public page's own card — LAN-269 item 4.
 *
 * Next merges `openGraph` **whole**: a page that sets any of it replaces every
 * field the root layout supplied, and a page that sets none of it inherits the
 * root's title and description verbatim. So a public page cannot simply declare
 * `title` and expect the shared link to follow — it would keep unfurling as
 * "Oxford Lancers · The Oxford Lancers club app" whatever its tab said. This
 * builds both halves from one pair of strings so they cannot drift.
 *
 * `siteName` is what WhatsApp and iMessage print above the card, so the title
 * is the page's own name and not the club's: repeating the club in both makes
 * the card read "Oxford Lancers / Club calendar — Oxford Lancers".
 */
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

/**
 * Where this deployment answers, for the absolute URLs `og:image` requires.
 *
 * `APP_BASE_URL` and nothing else. The request's `Host` header would work and
 * is what `publicOrigin` falls back to, but reading a header in metadata makes
 * every page that inherits it dynamic, and this is the root layout's metadata:
 * it would opt the entire application out of static rendering to save one
 * environment variable. No host is hard-coded anywhere in this application, so
 * when the variable is unset — every developer machine, and CI — Next resolves
 * the images against localhost, which is correct there and shared with nobody.
 */
export function metadataBase(): URL | undefined {
  const configured = (process.env.APP_BASE_URL ?? "").trim();
  if (configured === "") return undefined;
  try {
    return new URL(configured);
  } catch {
    return undefined;
  }
}
