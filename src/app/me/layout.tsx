import type { Metadata } from "next";

import { TOKEN_LINK_METADATA } from "@/lib/brand";

/** The generic club card for everything under `/me` (LAN-269 item 5) — a layout so a page added later inherits it rather than the root card. */
export const metadata: Metadata = TOKEN_LINK_METADATA;

export default function MeLayout({ children }: LayoutProps<"/me">) {
  return children;
}
