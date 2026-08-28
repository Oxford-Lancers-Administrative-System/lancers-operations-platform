/**
 * `/me` — the signed-in entry point to a player's own durable page. F-A3.
 *
 * `/me/[token]`'s own words live in `./[token]/presentation.ts`; this file is
 * this route's own small vocabulary, kept separate because the two pages
 * serve different credentials (a session here, a durable token there) and
 * must not be read as one screen sharing one set of strings.
 */

export const PAGE_HEADING = "Your page";

export const PAGE_HELP =
  "Open your own invitations, answers and outstanding questions — the same page a WhatsApp " +
  "or email link would have taken you to.";

export const OPEN_MY_PAGE = "Open your page";
