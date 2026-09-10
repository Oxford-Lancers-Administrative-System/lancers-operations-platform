import type { Metadata } from "next";

import { TOKEN_LINK_METADATA } from "@/lib/brand";

/**
 * The generic club card for everything under `/me` — LAN-269 item 5.
 *
 * A layout rather than an export on each page, because what has to be true here
 * is a property of the whole subtree: every route below `/me` is reached by a
 * durable, person-identifying token, and a page added later would otherwise
 * inherit the root card — which names the app, not the person, and so would
 * look harmless while quietly having no rule behind it.
 *
 * `/me/join/[token]` and `/me/stop/[token]` already set their own titles; a
 * page's metadata overrides the layout's field by field, so those keep their
 * wording and pick up the `openGraph`, `twitter` and `robots` blocks from here.
 *
 * `/me` itself is session-gated and is not a token link, but it is nobody
 * else's business either, so the same card is the right one.
 *
 * Renders nothing of its own. It exists for the metadata.
 */
export const metadata: Metadata = TOKEN_LINK_METADATA;

export default function MeLayout({ children }: LayoutProps<"/me">) {
  return children;
}
