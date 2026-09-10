/**
 * The same card again, for `twitter:image` — LAN-279.
 *
 * Next reads the two file conventions independently: a route with only an
 * `opengraph-image` emits `og:image` and no `twitter:image`, and a client that
 * prefers the Twitter tags then falls back to the root card. iMessage is one of
 * them. So the sign-up card has to be declared twice, and this re-export is how
 * it is declared twice without being drawn twice.
 */
export { default, alt, size, contentType } from "./opengraph-image";
