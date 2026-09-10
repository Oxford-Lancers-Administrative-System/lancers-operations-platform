import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import theme from "@/theme";
import { CLUB_NAME, metadataBase, SITE_DESCRIPTION } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * What every shared link says about the club — LAN-269.
 *
 * ## Nothing here is a `<link>` or a `<meta>` tag
 *
 * The icons, the manifest and the preview images are all Next.js metadata
 * *files*, not entries in this object: `icon.svg`, `apple-icon.png`,
 * `favicon.ico`, `manifest.ts`, `opengraph-image.png` and `twitter-image.png`
 * sit beside this file, and the framework emits the tags with correct types,
 * sizes and hashed URLs. Hand-writing them here would be a second, silently
 * divergent source for the same facts.
 *
 * ## The title carries the club, not the software
 *
 * "Lancers Operations Platform" — what this said until now — is what the tab,
 * a bookmark and every unfurled link showed a player, alongside the description
 * "infrastructure scaffold". Neither was written for the people who actually
 * hold these links. The template puts the club's name after each page's own,
 * and pages that must read exactly as Brian specified set `title.absolute`.
 *
 * `openGraph` and `twitter` exist so a link pasted into WhatsApp or iMessage
 * unfurls as the club rather than as a bare URL; `siteName` is what those apps
 * print above the card. `summary_large_image` is what makes the supplied
 * 1200×630 image render full width instead of as a thumbnail.
 *
 * Individual routes override all of this. The token links deliberately say less
 * (`TOKEN_LINK_METADATA`), and `/join/[code]` says more (LAN-279).
 */
export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: { default: CLUB_NAME, template: `%s — ${CLUB_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: CLUB_NAME,
  openGraph: {
    type: "website",
    siteName: CLUB_NAME,
    title: CLUB_NAME,
    description: SITE_DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: CLUB_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
